#!/bin/bash
# Train with TensorFlow Metal (GPU acceleration on Apple Silicon)

echo "🚀 Training with TensorFlow Metal (GPU Acceleration)"
echo "Your M4 Pro GPU will make this 10-30x faster!"
echo ""

cd "$(dirname "$0")"

uvx --from tensorflow-macos --with tensorflow-metal python 2_train_model.py
