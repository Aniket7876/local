const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { scrapeSingleTask: uwldScrape } = require('./uwld');
const { maerskOceanScraping: maerskScrape } = require('./maersk');
const { sinolinesScraping } = require('./12IH');
const { TabManager } = require('./tab-manager');

// Default user agent for all browser instances
const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Setup browser
const setupBrowser = async (useStealthMode = false) => {
  if (useStealthMode) {
    return puppeteerExtra.use(StealthPlugin()).launch({
      args: [
        `--user-agent=${defaultUserAgent}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      headless: false,
      ignoreHTTPSErrors: true,
      userDataDir: './browser-cache', // Persist cache and cookies locally
    });
  } else {
    return puppeteer.launch({
      headless: false,
      userDataDir: './browser-cache',
      args: [
        `--user-agent=${defaultUserAgent}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
    });
  }
};

// Initialize the WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

(async () => {

  const browser = await setupBrowser(true);
  const tabManager = new TabManager(browser);

  // Handle WebSocket connections
  wss.on('connection', (ws) => {
    console.log('Cloud VM connected');

    // Handle incoming messages from the VM
    ws.on('message', async (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        const { action } = parsedMessage;

        if (action === 'scrape') {
          if (parsedMessage.tasks && Array.isArray(parsedMessage.tasks)) {
            console.log(`Processing ${parsedMessage.tasks.length} scraping tasks`);

            const processTasks = async () => {
              const taskPromises = parsedMessage.tasks.map(async (task) => {
                try {
                  let result;
                  switch (task.code) {
                    case 'UWLD':
                      result = await uwldScrape(task, browser, tabManager);
                      break;
                    case 'MAEU':
                      result = await maerskScrape(task, browser, tabManager);
                      break;
                    case "12IH":
                      result = await sinolinesScraping(task, browser, tabManager, defaultUserAgent);
                      break;
                    default:
                      result = { status: 'error', message: `No scraper for code ${task.code}` };
                  }
                  ws.send(JSON.stringify(result));
                  console.log(`Completed and sent result for ${task.tracking_number}`);
                  return { success: true, trackingNumber: task.tracking_number };
                } catch (error) {
                  ws.send(JSON.stringify({
                    status: 'error',
                    trackingNumber: task.tracking_number,
                    code: task.code,
                    type: task.type,
                    message: error.message
                  }));
                  console.error(`Error sent for ${task.tracking_number}: ${error.message}`);
                  return { success: false, trackingNumber: task.tracking_number };
                }
              });

              const results = await Promise.allSettled(taskPromises);
              const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
              const errorCount = results.length - successCount;
              
              console.log(`All ${parsedMessage.tasks.length} tasks completed - Success: ${successCount}, Errors: ${errorCount}`);
            };

            processTasks();
          } else {
            const { tracking_number, type, code } = parsedMessage;
            const task = { tracking_number, type, code };
            
            let result;
            switch (task.code) {
              case 'UWLD':
                result = await uwldScrape(task, browser);
                break;
              case 'MAEU':
                result = await maerskScrape(task, browser);
                break;
              case "12IH":
                result = await sinolinesScraping(task, browser, null, defaultUserAgent);
                break;
              default:
                result = { status: 'error', message: `No scraper for code ${task.code}` };
            }
            ws.send(JSON.stringify(result));
          }
        } else {
          ws.send(JSON.stringify({ status: 'error', message: 'Invalid action' }));
        }
      } catch (error) {
        console.error('Message parsing error:', error);
        ws.send(JSON.stringify({ 
          status: 'error', 
          message: 'Invalid JSON format in message' 
        }));
      }
    });


    ws.on('error', (error) => console.error('WebSocket error:', error));
    ws.on('close', async () => {
      console.log('Cloud VM disconnected');
      await tabManager.closeAllPages();
    });
  });

  console.log('WebSocket server running on ws://localhost:8080');

  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await tabManager.closeAllPages();
    await browser.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await tabManager.closeAllPages();
    await browser.close();
    process.exit(0);
  });
})();

// cloudflared tunnel --url http://localhost:8080

module.exports = { setupBrowser, defaultUserAgent };

// if (require.main === module) {
//   const fs = require('fs');
//   const path = require('path');

//   (async () => {
//     const browser = await setupBrowser(true);

//     const testTask = {
//       tracking_number: 'SNLFNJJL001257',
//       code: '12IH',
//       type: 'mbl'
//     };

//     try {
//       const result = await sinolinesScraping(testTask, browser);
//       const outputPath = path.join(__dirname, 'test.json');
//       fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
//       console.log(`Result written to ${outputPath}`);
//     } catch (err) {
//       console.error('Test scraping failed:', err.message || err);
//     } finally {
//       await browser.close();
//     }
//   })();
// }
