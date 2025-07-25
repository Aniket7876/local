
const getTrackingData = async (
    trackingNo,
    scac,
    type,
    retry,
    browser,
    defaultUserAgent,
    tabManager = null,
    taskId = null
  ) => {
    let trackingData;
    
    try {
      let page;
      if (tabManager && taskId) {
        page = await tabManager.createManagedPage(taskId);
      } else {
        page = await browser.newPage();
      }
      await page.setUserAgent(defaultUserAgent);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (req.resourceType() == "stylesheet" || req.resourceType() == "font" || req.resourceType() == "image" || req.resourceType() == "media"
        || req.url().includes("https://www.maersk.com/tracking/assets/@maersk-global/icons") || req.url() == "https://assets.maerskline.com/mop-rum.js" || req.url() == "https://assets.maerskline.com/img/fav-icons/maersk.ico"
        || req.url() == "https://assets.maerskline.com/integrated-global-nav/3/3.3.0/ign.maeu.3.3.0.js" 
        || req.url() == "https://www.maersk.com/static/4abf9cad1fb4488d1796395f48d13b19892400114f7597/e/65226_747628217.js"
        || req.url() == "https://www.maersk.com/static/4abf9cad1fb4488d1796395f48d13b19892400114f7597"
        || req.url() == "https://www.googletagmanager.com/gtm.js?id=GTM-W6LN7D" ||
  
        req.url().includes("maersk.com/tracking/assets") || 
        req.url().includes("assets.maerskline.com") ||
        req.url().includes("googletagmanager.com") ||
        req.url().includes("maersk.com/static")
      ) {
          req.abort();
        } else {
          req.continue();
        }
      });
      await page.goto(`https://www.maersk.com/tracking/`, { timeout: 60000, waitUntil: "domcontentloaded" });
      console.log(`[extractTelemetryToken] carrier site opened for SCAC: ${scac}, trackingNo: ${trackingNo}, Type: ${type}`);
      
      // Extract telemetry token required in API
      await page.waitForFunction(() => window.bmak && typeof window.bmak.get_telemetry === 'function', { timeout: 10000 });

      trackingData = await page.evaluate((tracking_number, code, userAgent) => {
        // Get telemetry token
        const telemetry = window?.bmak?.get_telemetry();
        console.log(telemetry)
        if (!telemetry) return null;
  
        // Use Promise chaining instead of async/await
        return fetch(`https://api.maersk.com/synergy/tracking/${tracking_number}?operator=${code}`, {
          method: "GET",
          headers: {
            "akamai-bm-telemetry": telemetry,
            "consumer-key": "UtMm6JCDcGTnMGErNGvS2B98kt1Wl25H",
            "user-agent": userAgent,
          }
        })
        .then(response => {
          if (response.status === 404) {
            return { 
              message: "SEALINE_HASNT_PROVIDE_INFO", 
              isNoDataFoundOnSite: true 
            };
          }
          return response.json();
        })
        .catch(error => {
          console.error("[Fetch_API_Error] Browser fetch error:", error);
          return null;
        });
      }, trackingNo, scac, defaultUserAgent);  
      console.log(`[extractTelemetryToken] API call completed for SCAC: ${scac}, trackingNo: ${trackingNo}`);
      if (tabManager && taskId) {
        await tabManager.closePage(taskId);
      } else {
        await page.close();
      }
    } catch (error) {
      const puppeteerError = `Error in [getTrackingData] for SCAC: ${scac}, trackingNo: ${trackingNo}, Type: ${type}, Error: ${error.message ?? error}`;
      console.error(`[MAERSK_TELEMETRY_ERROR] ${puppeteerError}`);
      if (!trackingData) {
        trackingData = {
          message: "MAERSK_TELEMETRY_ERROR",
          isNoDataFoundOnSite: true,
        }
      }
    }
    return trackingData;
  };


const maerskOceanScraping = async (trackingInfo, browser, tabManager = null) => {
    const { tracking_number, code, type } = trackingInfo;
    const rawData = {};
    const taskId = `${code}-${tracking_number}-${Date.now()}`;
    // Get defaultUserAgent from global scope (imported from index.js)
    const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    try {
      console.log(`[maerskOceanScraping] started for SCAC: ${code}, trackingNo: ${tracking_number}, Type: ${type}`);
      // Extract telemetry token from puppeteer webpage
      let trackingData;
      let retryCount = 0;
      while (!trackingData && retryCount < 3) {
        trackingData = await getTrackingData(
          tracking_number,
          code,
          type,
          retryCount,
          browser,
          defaultUserAgent,
          tabManager,
          taskId
        );
        retryCount++;
      }
      if (trackingData) {
        rawData["data"] = trackingData;
        console.log(`[maerskOceanScraping] completed for SCAC: ${code}, trackingNo: ${tracking_number}, Type: ${type}`);
      }
      
      // Return in the same format as UWLD.js
      return {
        status: 'success',
        trackingNumber: trackingInfo.tracking_number,
        code: trackingInfo.code,
        type: trackingInfo.type,
        rawData: rawData
      };
      
    } catch (error) {
      console.error(`Error in [maerskOceanScraping] for SCAC: ${code}, trackingNo: ${tracking_number}, Type: ${type}, Error: ${error.message}`);
      
      // Return error status in the same format as UWLD.js
      return {
        status: 'error',
        trackingNumber: tracking_number,
        code: code,
        type: type,
        rawData: rawData,
        message: error.message
      };
    }
  };

module.exports = { maerskOceanScraping };
