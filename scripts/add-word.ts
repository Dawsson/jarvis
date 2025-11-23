#!/usr/bin/env bun

import { commonWords } from '../src/memory/common-words';

async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

async function main() {
  console.log('📝 Add Common Word for Speech Recognition\n');
  console.log('(This will be saved to .memory/common-words.json - a public file)\n');

  const word = await prompt('Word (e.g., "Colkify"): ');
  if (!word) {
    console.error('❌ Word is required');
    process.exit(1);
  }

  const phonetic = await prompt('Phonetic spelling (optional, e.g., "Kukafai"): ');
  const context = await prompt('Context (optional, e.g., "Project name"): ');

  try {
    const commonWord = await commonWords.add(
      word,
      phonetic || undefined,
      context || undefined
    );

    console.log(`\n✅ Added common word:`);
    console.log(`   Word: ${commonWord.word}`);
    if (commonWord.phonetic) console.log(`   Phonetic: ${commonWord.phonetic}`);
    if (commonWord.context) console.log(`   Context: ${commonWord.context}`);
    console.log(`\n💡 Saved to: .memory/common-words.json (public file)`);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

main();
