'use strict';

// Run the existing browser checks without replacing any earlier screenshots.
// No security exclusions are needed: every capture is a new, exclusive file.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const parent = path.resolve(process.env.TEST_OUTPUT || path.join(__dirname, '..', 'test-results'));
fs.mkdirSync(parent, { recursive: true });
const output = fs.mkdtempSync(path.join(parent, 'preserved-run-'));
process.env.TEST_OUTPUT = output;
console.log('New screenshot directory: ' + output);
let sequence = 0;

for (const engine of [chromium, webkit]) {
  const launch = engine.launch.bind(engine);
  engine.launch = async (...launchArgs) => {
    const browser = await launch(...launchArgs);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...contextArgs) => {
      const context = await newContext(...contextArgs);
      const newPage = context.newPage.bind(context);
      context.newPage = async (...pageArgs) => {
        const page = await newPage(...pageArgs);
        const screenshot = page.screenshot.bind(page);
        page.screenshot = async (options = {}) => {
          const { path: requestedPath, ...captureOptions } = options;
          const bytes = await screenshot(captureOptions);
          if (requestedPath) {
            const filename = String(++sequence).padStart(3, '0') + '-' + path.basename(requestedPath);
            fs.writeFileSync(path.join(output, filename), bytes, { flag: 'wx' });
          }
          return bytes;
        };
        return page;
      };
      return context;
    };
    return browser;
  };
}

require('./browser.cjs');
