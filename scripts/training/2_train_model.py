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
    """Create simple CNN model appropriate for small dataset"""
    model = keras.Sequential([
        keras.layers.Conv1D(24, 5, activation='relu', input_shape=input_shape),
        keras.layers.MaxPooling1D(2),
        keras.layers.Dropout(0.25),
        keras.layers.Conv1D(48, 3, activation='relu'),
        keras.layers.MaxPooling1D(2),
        keras.layers.Dropout(0.25),
        keras.layers.Flatten(),
        keras.layers.Dense(48, activation='relu'),
        keras.layers.Dropout(0.4),
        keras.layers.Dense(1, activation='sigmoid')
    ])

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='binary_crossentropy',
        metrics=['accuracy']
    )

    return model

def main():
    # Load data
    X, y = load_data()

    # Split into train/validation
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"📊 Training set: {len(X_train)} samples")
    print(f"📊 Validation set: {len(X_val)} samples\n")

    # Create model
    print("🏗️  Building model...")
    model = create_model(input_shape=(MAX_FRAMES, N_MFCC))
    model.summary()

    # Train
    print("\n🚀 Training...\n")

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=100,
        batch_size=16,
        callbacks=[
            keras.callbacks.EarlyStopping(
                monitor='val_loss',
                patience=15,
                restore_best_weights=True
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=5,
                min_lr=0.00001
            )
        ]
    )

    # Evaluate
    print("\n📊 Final Results:")
    train_loss, train_acc = model.evaluate(X_train, y_train, verbose=0)
    val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)

    print(f"  Training accuracy: {train_acc:.2%}")
    print(f"  Validation accuracy: {val_acc:.2%}")

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
        "val_accuracy": float(val_acc)
    }

    with open("jarvis_model/metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print("✅ Model saved to jarvis_model/\n")
    print("Next step: Test the model")
    print("  bun 3_test_model.ts\n")

if __name__ == "__main__":
    main()
