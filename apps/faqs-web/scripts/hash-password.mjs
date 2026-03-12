#!/usr/bin/env node
/* global process, console */
import {randomBytes, scryptSync} from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const derived = scryptSync(password, salt, 64).toString('hex');
console.log(`${salt}:${derived}`);
