const cheerio = require('cheerio');

const parseHtmlContent = (html) => {
  let isNoElementFound = false;
  const parsedData = {
    metaData: {},
    route: [],
    containersInfo: [],
    events: [],
    orders: [],
    referenceData: [],
    customsEntries: []
  };
  
  try {
    const $ = cheerio.load(html);
    
    parsedData.metaData = {
      bill: $("#HouseBill").text().trim() || "",
      origin: $("#Origin").text().trim() || "",
      etd: $("#ETD").text().trim() || "",
      destination: $("#Destination").text().trim() || "",
      eta: $("#ETA").text().trim() || "",
      shippersRef: $("#ClientShipperRefData").text().trim() || "",
      orderRef: $("#Ztextlabel1").text().trim() || "",
      releaseType: $("#ReleaseTypeCodeLookupLabel").text().trim() || "",
      onBoard: $("#OnBoardCodeLookupLabel").text().trim() || ""
    };
    
    // Parse transport table for route information
    const transportTable = $("#TransportGridController_TransportGrid");
    if (!transportTable) {
        isNoElementFound = true;
        return parsedData; 
    }
    if (transportTable.length) {
      const rows = transportTable.find("tr.DetailsCell");

      parsedData.route = [];
      
      if (rows.length > 0) {
        // Process each leg
        rows.each((index, element) => {
          const leg = $(element);
          const legNumber = leg.find("td:nth-child(1) span").attr("title");
          const mode = leg.find("td:nth-child(2) span").attr("title");
          const type = leg.find("td:nth-child(3) span").attr("title");
          const vessel = leg.find("td:nth-child(6) span").attr("title");
          const voyage = leg.find("td:nth-child(7) span").attr("title");
          const loadLocation = leg.find("td:nth-child(8) span").attr("title");
          const dischargeLocation = leg.find("td:nth-child(9) span").attr("title");
          const departureDate = leg.find("td:nth-child(10) div span").text().trim();
          const arrivalDate = leg.find("td:nth-child(11) div span").text().trim();
          const status = leg.find("td:nth-child(12) span").attr("title");
          const carrier = leg.find("td:nth-child(13) span").attr("title");
          
          const legData = {
            legNumber,
            mode,
            type,
            vessel,
            voyage,
            loadLocation,
            dischargeLocation,
            departureDate,
            arrivalDate,
            status,
            carrier
          };

          parsedData.route.push(legData);
        });
      }
    }
    
    // Parse container information
    const containerTable = $("#ContainerGridController_ContainerGrid");
    if (!containerTable) {
        isNoElementFound = true;
        return parsedData;
    }
    
    // Create a map to store container data temporarily
    const containerMap = new Map();
    
    if (containerTable.length) {
      const containerRows = containerTable.find("tr.DetailsCell");
      
      containerRows.each((index, element) => {
        const containerRow = $(element);
        const containerNumber = containerRow.find("td:nth-child(1) a").text().trim();
        
        if (containerNumber) {
          containerMap.set(containerNumber, {
            containerNumber: containerNumber,
            seal: containerRow.find("td:nth-child(2) span").attr("title") || "",
            containerType: containerRow.find("td:nth-child(3) span").attr("title") || "",
            containerMode: containerRow.find("td:nth-child(4) span").attr("title") || ""
          });
        }
      });
    }
    
    // Parse pack lines information
    const packLinesTable = $("#PackLinesGridController_PackLinesGrid");
    if (packLinesTable.length) {
      const packRows = packLinesTable.find("tr.DetailsCell");
      
      packRows.each((index, element) => {
        const packRow = $(element);
        const containerNumber = packRow.find("td:nth-child(4) span").attr("title")?.trim();
        const pieces = packRow.find("td:nth-child(1) span").attr("title")?.trim();
        const packType = packRow.find("td:nth-child(2) span").attr("title")?.trim();
        
        if (containerNumber && containerMap.has(containerNumber)) {
          const containerData = containerMap.get(containerNumber);
          containerData.pieces = pieces || "";
          containerData.packType = packType || "";
        }
      });
    }

    parsedData.containersInfo = Array.from(containerMap.values());
    
    // Parse events information
    const eventsTable = $("#TrackingEvents_TrackingEventsPanel_TrackingEventsGridController_TrackingEventsGrid");
    if (!eventsTable) {
        isNoElementFound = true;
        return parsedData;
    }
    if (eventsTable.length) {
      const eventRows = eventsTable.find("tr.DetailsCell");
      
      eventRows.each((index, element) => {
        const eventRow = $(element);
        const eventCode = eventRow.find("td:nth-child(1) span").attr("title");
        
        if (eventCode) {
          parsedData.events.push({
            eventCode: eventCode,
            eventTime: eventRow.find("td:nth-child(2) span").attr("title") || "",
            description: eventRow.find("td:nth-child(3) span").attr("title") || "",
            eventDetails: eventRow.find("td:nth-child(4) span").attr("title") || ""
          });
        }
      });
    }
    
    // Parse orders information
    const ordersTable = $("#OrdersGridController_OrdersGrid");
    if (ordersTable.length) {
      const orderRows = ordersTable.find("tr.DetailsCell");
      
      // Check if there are actual order rows
      if (orderRows.length > 0) {
        orderRows.each((index, element) => {
          const orderRow = $(element);
          const orderNumber = orderRow.find("td:nth-child(1)").text().trim();
          
          if (orderNumber) {
            parsedData.orders.push({
              orderNumber: orderNumber,
              transportMode: orderRow.find("td:nth-child(2)").text().trim() || "",
              status: orderRow.find("td:nth-child(3)").text().trim() || "",
              orderDate: orderRow.find("td:nth-child(4)").text().trim() || ""
            });
          }
        });
      } else {
        // Check for "No records found" message
        const noRecordsMessage = ordersTable.find("tr td div span").text().trim();
        if (noRecordsMessage === "No records found") {
          parsedData.orders = [];
        }
      }
    }
    
    // Parse reference data information
    const referenceDataTable = $("#ReferenceDataGridController_ReferenceDataGrid");
    if (referenceDataTable.length) {
      const referenceRows = referenceDataTable.find("tr.DetailsCell");
      
      referenceRows.each((index, element) => {
        const referenceRow = $(element);
        const numberType = referenceRow.find("td:nth-child(2) span").attr("title");
        
        if (numberType) {
          parsedData.referenceData.push({
            country: referenceRow.find("td:nth-child(1) span").text().trim() || "",
            numberType: numberType,
            number: referenceRow.find("td:nth-child(3) span").attr("title") || "",
            typeDescription: referenceRow.find("td:nth-child(4) span").attr("title") || ""
          });
        }
      });
    }
    
    // Parse customs entries information
    const customsEntriesTable = $("#CustomsEntriesDataGridController_CustomsEntriesDataGrid");
    if (customsEntriesTable.length) {
      const customsRows = customsEntriesTable.find("tr.DetailsCell");

      if (customsRows.length > 0) {
        customsRows.each((index, element) => {
          const customsRow = $(element);
          const referenceNumber = customsRow.find("td:nth-child(1)").text().trim();
          
          if (referenceNumber) {
            parsedData.customsEntries.push({
              referenceNumber: referenceNumber,
              entryNumber: customsRow.find("td:nth-child(2)").text().trim() || "",
              messageStatus: customsRow.find("td:nth-child(3)").text().trim() || "",
              entryAdvice: customsRow.find("td:nth-child(4)").text().trim() || ""
            });
          }
        });
      } else {
        // Check for "No records found" message
        const noRecordsMessage = customsEntriesTable.find("tr td div span").text().trim();
        if (noRecordsMessage === "No records found") {
          parsedData.customsEntries = [];
        }
      }
    }
    
  } catch (error) {
    console.error("Error parsing HTML content:", error);
  }
  
  return parsedData;
};

const scrapeSingleTask = async (task, browser, tabManager = null) => {
    let page;
    const taskId = `${task.code}-${task.tracking_number}-${Date.now()}`;
    
    try {
      const { tracking_number, type, code } = task;
      
      // Navigate to the provided URL
      if (tabManager) {
        page = await tabManager.createManagedPage(taskId);
      } else {
        page = await browser.newPage();
      }
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (req.resourceType() === "stylesheet" || req.resourceType() === "font" || req.resourceType() === "image" || req.resourceType() === "script" || req.resourceType() === "media") {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(
        "https://www.shipuwl.com/ocean-freight/",
        { waitUntil: "domcontentloaded", timeout: 120000 }
      );

      await page.waitForSelector("#ShipmentQuickview");
      await page.type("#ShipmentQuickview", tracking_number, { delay: 50 });
      console.log(`Tracking number ${tracking_number} entered`);

      await page.waitForSelector('button.btn.btn-warning[type="submit"]');
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle0" }),
        page.click('button.btn.btn-warning[type="submit"]')
      ]);

      console.log(`New page loaded successfully for ${tracking_number}`);

      // Get the page HTML and store it
      const content = await page.content();
      const cleanedHTML = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
      const rawHTML = cleanedHTML?.replace(/\s+/g, " ")?.trim();

      let rawData = null;

      // Check if login is required (no data available)
      if (cleanedHTML.includes(`action="./Login.aspx?QuickViewNumber=${tracking_number}"`)) {
        rawData = {
          message: "SEALINE_HASNT_PROVIDE_INFO",
          isNoDataFoundOnSite: true
        };
      } else {
        // Parse the HTML content
        const parsedData = parseHtmlContent(rawHTML);
        rawData = {
          rawHTML: null,
          ...parsedData
        };
      }

      // Close the page
      if (tabManager) {
        await tabManager.closePage(taskId);
      } else {
        await page.close();
      }

      return {
        status: 'success',
        trackingNumber: task.tracking_number,
        code: task.code,
        type: task.type,
        rawData: rawData
      };

    } catch (error) {
      console.error(`Scraping error for ${task.tracking_number}:`, error);
      
      // Close page if it exists
      if (page) {
        try {
          if (tabManager) {
            await tabManager.closePage(taskId);
          } else {
            await page.close();
          }
        } catch (closeError) {
          console.error('Error closing page:', closeError);
        }
      }

      return {
        status: 'error',
        trackingNumber: task.tracking_number,
        code: task.code,
        type: task.type,
        message: error.message
      };
    }
  };

module.exports = { parseHtmlContent, scrapeSingleTask };