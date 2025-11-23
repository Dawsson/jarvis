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
from sklearn.metrics import precision_score, recall_score

print("🧠 Training Jarvis Wake Word Model")
print("=" * 50)

# Parameters
SAMPLE_RATE = 16000
DURATION = 1.5
N_MFCC = 13
MAX_FRAMES = 94  # ~1.5 seconds with hop_length=256

def extract_features(file_path):
    """Extract MFCC features from audio file"""
    try:
        audio, sr = librosa.load(file_path, sr=SAMPLE_RATE, duration=DURATION)

        # Extract MFCC features
        mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=N_MFCC, hop_length=256)

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

    jarvis_files = list(jarvis_dir.glob("*.wav"))
    noise_files = list(noise_dir.glob("*.wav"))

    print(f"  - {len(jarvis_files)} Jarvis samples")
    print(f"  - {len(noise_files)} noise samples")

    X = []
    y = []

    # Load positive samples (Jarvis)
    for file in jarvis_files:
        features = extract_features(str(file))
        if features is not None:
            X.append(features)
            y.append(1)

    # Load negative samples (noise)
    for file in noise_files:
        features = extract_features(str(file))
        if features is not None:
            X.append(features)
            y.append(0)

    X = np.array(X)
    y = np.array(y)

    print(f"✅ Loaded {len(X)} samples")
    print(f"   Shape: {X.shape}\n")

    return X, y

def create_model(input_shape):
    """Create CNN model with improved architecture"""
    model = keras.Sequential([
        keras.layers.Conv1D(32, 5, activation='relu', input_shape=input_shape),
        keras.layers.BatchNormalization(),
        keras.layers.MaxPooling1D(2),
        keras.layers.Dropout(0.3),
        keras.layers.Conv1D(64, 3, activation='relu'),
        keras.layers.BatchNormalization(),
        keras.layers.MaxPooling1D(2),
        keras.layers.Dropout(0.3),
        keras.layers.Conv1D(64, 3, activation='relu'),
        keras.layers.BatchNormalization(),
        keras.layers.Dropout(0.3),
        keras.layers.Flatten(),
        keras.layers.Dense(64, activation='relu'),
        keras.layers.Dropout(0.5),
        keras.layers.Dense(32, activation='relu'),
        keras.layers.Dropout(0.4),
        keras.layers.Dense(1, activation='sigmoid')
    ])

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.0005),
        loss='binary_crossentropy',
        metrics=['accuracy', 'precision', 'recall']
    )

    return model

def augment_data(X, y, augment_factor=2):
    """Augment training data with time shifting and noise"""
    X_augmented = []
    y_augmented = []
    
    # Add original data
    X_augmented.extend(X)
    y_augmented.extend(y)
    
    # Augment positive samples more (Jarvis)
    for i in range(len(X)):
        if y[i] == 1:  # Only augment Jarvis samples
            for _ in range(augment_factor):
                # Time shift (roll the features)
                shift = np.random.randint(-5, 6)
                X_shifted = np.roll(X[i], shift, axis=0)
                X_augmented.append(X_shifted)
                y_augmented.append(1)
    
    return np.array(X_augmented), np.array(y_augmented)

def main():
    # Load data
    X, y = load_data()

    # Calculate class weights to handle imbalance
    class_weights = compute_class_weight(
        'balanced',
        classes=np.unique(y),
        y=y
    )
    class_weight_dict = {0: class_weights[0], 1: class_weights[1]}
    
    print(f"\n⚖️  Class weights:")
    print(f"   Negative (noise): {class_weight_dict[0]:.3f}")
    print(f"   Positive (Jarvis): {class_weight_dict[1]:.3f}\n")

    # Split into train/validation
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"📊 Training set: {len(X_train)} samples")
    print(f"📊 Validation set: {len(X_val)} samples")

    # Augment training data
    print("\n🔄 Augmenting training data...")
    X_train_aug, y_train_aug = augment_data(X_train, y_train, augment_factor=2)
    print(f"   After augmentation: {len(X_train_aug)} samples\n")

    # Create model
    print("🏗️  Building model...")
    model = create_model(input_shape=(MAX_FRAMES, N_MFCC))
    model.summary()

    # Train
    print("\n🚀 Training...\n")

    history = model.fit(
        X_train_aug, y_train_aug,
        validation_data=(X_val, y_val),
        epochs=150,
        batch_size=16,
        class_weight=class_weight_dict,
        callbacks=[
            keras.callbacks.EarlyStopping(
                monitor='val_loss',
                patience=20,
                restore_best_weights=True,
                verbose=1
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=7,
                min_lr=0.00001,
                verbose=1
            ),
            keras.callbacks.ModelCheckpoint(
                'jarvis_model/best_model.h5',
                monitor='val_loss',
                save_best_only=True,
                verbose=1
            )
        ],
        verbose=1
    )

    # Load best model if checkpoint exists
    if os.path.exists('jarvis_model/best_model.h5'):
        print("\n📥 Loading best model from checkpoint...")
        model = keras.models.load_model('jarvis_model/best_model.h5')

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
