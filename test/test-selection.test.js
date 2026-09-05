'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {isTestPath}=require('../src/test-selection');
test('recognizes common test paths without treating source as tests',()=>{assert.equal(isTestPath('test/audio.test.js'),true);assert.equal(isTestPath('tests/audio_test.cpp'),true);assert.equal(isTestPath('src/audio.cpp'),false);});
