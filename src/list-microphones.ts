import { spawn } from "child_process";

export interface Microphone {
  index: number;
  name: string;
  sampleRate: number;
  channels: number;
}

export async function listMicrophones(): Promise<Microphone[]> {
  return new Promise((resolve, reject) => {
    const process = spawn("uvx", [
      "--with",
      "pyaudio",
      "python3",
      "-c",
      `
import pyaudio
import json

p = pyaudio.PyAudio()
devices = []

for i in range(p.get_device_count()):
    info = p.get_device_info_by_index(i)
    if info['maxInputChannels'] > 0:
        devices.append({
            'index': i,
            'name': info['name'],
            'sampleRate': int(info['defaultSampleRate']),
            'channels': info['maxInputChannels']
        })

print(json.dumps(devices))
p.terminate()
      `,
    ]);

    let output = "";
    process.stdout.on("data", (data) => {
      output += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        try {
          const devices = JSON.parse(output.trim());
          resolve(devices);
        } catch (e) {
          reject(new Error("Failed to parse microphone list"));
        }
      } else {
        reject(new Error(`Failed to list microphones: exit code ${code}`));
      }
    });
  });
}
