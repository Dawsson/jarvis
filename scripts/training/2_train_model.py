#!/usr/bin/env python3
"""
Step 2: Train the Wake Word Model using Python
"""

import numpy as np
import librosa
import os
import json
from pathlib import Path
import tensorflow as tf
from tensorflow import keras
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import precision_score, recall_score, f1_score

print("🧠 Training Jarvis Wake Word Model")
print("=" * 50)

# Parameters
SAMPLE_RATE = 16000
DURATION = 1.5
N_MFCC = 20  # Increased from 13 for better feature representation
USE_DELTAS = True  # Add delta and delta-delta features
MAX_FRAMES = 94  # ~1.5 seconds with hop_length=256

def extract_features(file_path):
    """Extract MFCC features with deltas from audio file"""
    try:
        audio, sr = librosa.load(file_path, sr=SAMPLE_RATE, duration=DURATION)

        # Extract MFCC features
        mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=N_MFCC, hop_length=256)

        if USE_DELTAS:
            # Add delta (velocity) and delta-delta (acceleration) features
            delta = librosa.feature.delta(mfcc)
            delta2 = librosa.feature.delta(mfcc, order=2)
            # Combine all features: MFCC + delta + delta-delta
            mfcc = np.vstack([mfcc, delta, delta2])

        # Pad or truncate to fixed length
        if mfcc.shape[1] < MAX_FRAMES:
            pad_width = MAX_FRAMES - mfcc.shape[1]
            mfcc = np.pad(mfcc, ((0, 0), (0, pad_width)), mode='constant')
        else:
            mfcc = mfcc[:, :MAX_FRAMES]

        return mfcc.T  # Transpose to (time_steps, features)
    except Exception as e:
        print(f"  ⚠️  Error processing {file_path}: {e}")
        return None

def load_data():
    """Load training data"""
    print("\n📂 Loading training data...")

    jarvis_dir = Path("training_data/jarvis")
    noise_dir = Path("training_data/noise")
    negative_dir = Path("training_data/negative")

    jarvis_files = list(jarvis_dir.glob("*.wav"))
    noise_files = list(noise_dir.glob("*.wav"))
    negative_files = list(negative_dir.glob("*.wav")) if negative_dir.exists() else []

    print(f"  - {len(jarvis_files)} Jarvis samples")
    print(f"  - {len(noise_files)} noise samples")
    print(f"  - {len(negative_files)} negative speech samples")

    X = []
    y = []

    # Load positive samples (Jarvis)
    for file in jarvis_files:
        features = extract_features(str(file))
        if features is not None:
            X.append(features)
            y.append(1)

    # Load negative samples (noise + negative speech)
    for file in noise_files:
        features = extract_features(str(file))
        if features is not None:
            X.append(features)
            y.append(0)
    
    # Load negative speech samples
    for file in negative_files:
        features = extract_features(str(file))
        if features is not None:
            X.append(features)
            y.append(0)

    X = np.array(X)
    y = np.array(y)

    print(f"✅ Loaded {len(X)} samples")
    print(f"   Shape: {X.shape}\n")

    return X, y

def focal_loss(gamma=2.0, alpha=0.25):
    """Focal loss - focuses learning on hard examples and reduces false positives"""
    def focal_loss_fixed(y_true, y_pred):
        epsilon = keras.backend.epsilon()
        y_pred = keras.backend.clip(y_pred, epsilon, 1.0 - epsilon)
        p_t = tf.where(tf.equal(y_true, 1), y_pred, 1 - y_pred)
        alpha_t = tf.where(tf.equal(y_true, 1), alpha, 1 - alpha)
        focal_loss = -alpha_t * tf.pow((1 - p_t), gamma) * tf.math.log(p_t)
        return tf.reduce_mean(focal_loss)
    return focal_loss_fixed

def create_model(input_shape):
    """Create CNN+LSTM hybrid model - CNN for local patterns, LSTM for temporal modeling"""
    model = keras.Sequential([
        # CNN layers for local feature extraction
        keras.layers.Conv1D(64, 5, activation='relu', input_shape=input_shape),
        keras.layers.BatchNormalization(),
        keras.layers.MaxPooling1D(2),
        keras.layers.Dropout(0.3),

        keras.layers.Conv1D(128, 3, activation='relu'),
        keras.layers.BatchNormalization(),
        keras.layers.MaxPooling1D(2),
        keras.layers.Dropout(0.3),

        keras.layers.Conv1D(128, 3, activation='relu'),
        keras.layers.BatchNormalization(),
        keras.layers.Dropout(0.3),

        # Bidirectional LSTM for temporal modeling
        keras.layers.Bidirectional(keras.layers.LSTM(64, return_sequences=True)),
        keras.layers.Dropout(0.4),
        keras.layers.Bidirectional(keras.layers.LSTM(32)),
        keras.layers.Dropout(0.4),

        # Dense layers
        keras.layers.Dense(64, activation='relu'),
        keras.layers.Dropout(0.5),
        keras.layers.Dense(32, activation='relu'),
        keras.layers.Dropout(0.5),
        keras.layers.Dense(1, activation='sigmoid')
    ])

    # Use focal loss to focus on hard negatives and reduce false positives
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.0005),
        loss=focal_loss(gamma=2.0, alpha=0.25),
        metrics=['accuracy', 'precision', 'recall']
    )

    return model

def augment_data(X, y, augment_factor=3):
    """Advanced data augmentation with multiple techniques"""
    X_augmented = []
    y_augmented = []

    # Add original data
    X_augmented.extend(X)
    y_augmented.extend(y)

    # Augment positive samples (Jarvis) more aggressively
    for i in range(len(X)):
        if y[i] == 1:  # Only augment Jarvis samples
            for j in range(augment_factor):
                # Apply different augmentation techniques
                augmented = X[i].copy()

                # 1. Time shift
                if j == 0 or np.random.random() > 0.5:
                    shift = np.random.randint(-5, 6)
                    augmented = np.roll(augmented, shift, axis=0)

                # 2. Add small noise to features (simulates slight variations)
                if j == 1 or np.random.random() > 0.5:
                    noise = np.random.normal(0, 0.05, augmented.shape)
                    augmented = augmented + noise

                # 3. Scale features (simulates volume variations)
                if j == 2 or np.random.random() > 0.5:
                    scale = np.random.uniform(0.85, 1.15)
                    augmented = augmented * scale

                X_augmented.append(augmented)
                y_augmented.append(1)

    # Augment negative samples moderately to improve robustness
    negative_augment_factor = 1
    for i in range(len(X)):
        if y[i] == 0:  # Augment negative samples
            for _ in range(negative_augment_factor):
                augmented = X[i].copy()
                # Lighter augmentation for negatives
                shift = np.random.randint(-3, 4)
                augmented = np.roll(augmented, shift, axis=0)
                X_augmented.append(augmented)
                y_augmented.append(0)

    return np.array(X_augmented), np.array(y_augmented)

def main():
    # Load data
    X, y = load_data()

    # Calculate class weights - penalize false positives more heavily
    # Increase weight for negatives to make model more conservative
    class_weights = compute_class_weight(
        'balanced',
        classes=np.unique(y),
        y=y
    )
    # Boost negative class weight to reduce false positives
    # This makes the model more conservative - harder to trigger
    # Reduced from 1.5 to 1.2 to balance precision/recall better
    negative_weight_multiplier = 1.2  # Moderate penalty for false positives
    class_weight_dict = {
        0: class_weights[0] * negative_weight_multiplier,  # Negatives (higher penalty)
        1: class_weights[1]  # Positives (normal weight)
    }
    
    print(f"\n⚖️  Class weights (penalizing false positives):")
    print(f"   Negative (noise): {class_weight_dict[0]:.3f} (×{negative_weight_multiplier})")
    print(f"   Positive (Jarvis): {class_weight_dict[1]:.3f}\n")

    # Split into train/validation
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"📊 Training set: {len(X_train)} samples")
    print(f"📊 Validation set: {len(X_val)} samples")

    # Custom callback to save model with best F1 score and handle early stopping
    class F1Checkpoint(keras.callbacks.Callback):
        def __init__(self, filepath, X_val, y_val, patience=20):
            super().__init__()
            self.filepath = filepath
            self.X_val = X_val
            self.y_val = y_val
            self.patience = patience
            self.best_f1 = float('-inf')
            self.wait = 0
            self.best_weights = None
            
        def on_epoch_end(self, epoch, logs=None):
            logs = logs or {}
            # Calculate F1 score
            val_pred = (self.model.predict(self.X_val, verbose=0) > 0.5).astype(int).flatten()
            val_f1 = f1_score(self.y_val, val_pred, zero_division=0)
            logs['val_f1'] = val_f1
            
            if val_f1 > self.best_f1:
                self.best_f1 = val_f1
                self.wait = 0
                self.best_weights = self.model.get_weights()
                self.model.save(self.filepath, overwrite=True)
                print(f"\n   ✅ F1 score improved to {val_f1:.4f}, saving model...")
            else:
                self.wait += 1
                print(f"\n   F1 score: {val_f1:.4f} (best: {self.best_f1:.4f}, wait: {self.wait}/{self.patience})")
            
            # Early stopping
            if self.wait >= self.patience:
                print(f"\n   Early stopping: F1 score did not improve for {self.patience} epochs")
                self.model.stop_training = True
                if self.best_weights is not None:
                    self.model.set_weights(self.best_weights)
                    print(f"   Restored weights from best F1 score: {self.best_f1:.4f}")

    # Augment training data
    print("\n🔄 Augmenting training data...")
    X_train_aug, y_train_aug = augment_data(X_train, y_train, augment_factor=3)
    print(f"   After augmentation: {len(X_train_aug)} samples\n")

    # Create model
    print("🏗️  Building model...")
    # If using deltas, feature dimension is N_MFCC * 3 (MFCC + delta + delta-delta)
    feature_dim = N_MFCC * 3 if USE_DELTAS else N_MFCC
    model = create_model(input_shape=(MAX_FRAMES, feature_dim))
    model.summary()

    # Train
    print("\n🚀 Training...\n")

    # Create F1 checkpoint callback
    f1_checkpoint = F1Checkpoint('jarvis_model/best_model.h5', X_val, y_val, patience=20)

    history = model.fit(
        X_train_aug, y_train_aug,
        validation_data=(X_val, y_val),
        epochs=150,
        batch_size=16,
        class_weight=class_weight_dict,
        callbacks=[
            keras.callbacks.EarlyStopping(
                monitor='val_loss',
                mode='min',
                patience=50,  # Higher patience since F1 callback handles it
                restore_best_weights=False,  # F1 callback handles weight restoration
                verbose=1
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=7,
                min_lr=0.00001,
                verbose=1
            ),
            f1_checkpoint
        ],
        verbose=1
    )

    # Note: F1Checkpoint callback already restored the best weights based on F1 score
    # The model variable contains the best model weights (best F1 score)

    # Evaluate
    print("\n📊 Final Results:")
    train_metrics = model.evaluate(X_train, y_train, verbose=0)
    val_metrics = model.evaluate(X_val, y_val, verbose=0)
    
    # Handle different return formats
    if len(train_metrics) == 4:
        train_loss, train_acc, train_prec, train_rec = train_metrics
        val_loss, val_acc, val_prec, val_rec = val_metrics
    else:
        train_loss, train_acc = train_metrics
        val_loss, val_acc = val_metrics
        # Calculate precision and recall manually
        train_pred = (model.predict(X_train, verbose=0) > 0.5).astype(int).flatten()
        val_pred = (model.predict(X_val, verbose=0) > 0.5).astype(int).flatten()
        train_prec = precision_score(y_train, train_pred, zero_division=0)
        train_rec = recall_score(y_train, train_pred, zero_division=0)
        val_prec = precision_score(y_val, val_pred, zero_division=0)
        val_rec = recall_score(y_val, val_pred, zero_division=0)

    print(f"  Training:")
    print(f"    Accuracy: {train_acc:.2%}")
    print(f"    Precision: {train_prec:.2%}")
    print(f"    Recall: {train_rec:.2%}")
    print(f"  Validation:")
    print(f"    Accuracy: {val_acc:.2%}")
    print(f"    Precision: {val_prec:.2%}")
    print(f"    Recall: {val_rec:.2%}")

    # Save model
    print("\n💾 Saving model...")
    os.makedirs("jarvis_model", exist_ok=True)
    model.save("jarvis_model/model.h5")

    # Save metadata
    metadata = {
        "max_frames": MAX_FRAMES,
        "n_mfcc": N_MFCC,
        "use_deltas": USE_DELTAS,
        "sample_rate": SAMPLE_RATE,
        "train_accuracy": float(train_acc),
        "val_accuracy": float(val_acc),
        "train_precision": float(train_prec),
        "val_precision": float(val_prec),
        "train_recall": float(train_rec),
        "val_recall": float(val_rec)
    }

    with open("jarvis_model/metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print("✅ Model saved to jarvis_model/\n")
    print("Next step: Test the model")
    print("  bun 3_test_model.ts\n")

if __name__ == "__main__":
    main()
