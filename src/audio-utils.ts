import { spawn } from "child_process";

export async function getAudioLevel(deviceIndex: number | null): Promise<number> {
  return new Promise((resolve) => {
    const args = [
      "--with",
      "pyaudio",
      "--with",
      "numpy",
      "python3",
      "-c",
      `
import pyaudio
import numpy as np

CHUNK = 1024
RATE = 16000

p = pyaudio.PyAudio()
kwargs = {"format": pyaudio.paInt16, "channels": 1, "rate": RATE, "input": True, "frames_per_buffer": CHUNK}
${deviceIndex !== null ? `kwargs["input_device_index"] = ${deviceIndex}` : ""}

stream = p.open(**kwargs)
data = stream.read(CHUNK, exception_on_overflow=False)
stream.close()
p.terminate()

audio_data = np.frombuffer(data, dtype=np.int16).astype(np.float32)
rms = np.sqrt(np.mean(audio_data**2))
normalized = min(100, int((rms / 3000) * 100))
print(normalized)
      `,
    ];

    const process = spawn("uvx", args);
    let output = "";

    process.stdout.on("data", (data) => {
      output += data.toString();
    });

    process.on("close", () => {
      const level = parseInt(output.trim()) || 0;
      resolve(level);
    });

    setTimeout(() => {
      process.kill();
      resolve(0);
    }, 500);
  });
}

export function playAudioFile(filename: string) {
  spawn("afplay", [filename]);
}
