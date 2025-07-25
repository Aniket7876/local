const cheerio = require('cheerio');
// Remove circular dependency - these will be passed as parameters or accessed differently

const cleanRoute = async (rawroute) => {
    // Check if rawroute exists and has at least one element
    if (!rawroute || !rawroute.length || !rawroute[0]) {
        console.log('[12IH] cleanRoute: rawroute is empty or invalid');
        return null;
    }
    
    const $ = cheerio.load(rawroute[0]);

    const rows = $("#BlnoListGridView tr.griditem, #BlnoListGridView tr.Alternatingback");

    if (rows.length === 0) return null;

    const legs = [];

    rows.each((i, row) => {
        const polLoc = $(row).find('[id*="POLL_"]').text().trim() || "";
        const departureDate = $(row).find('[id*="DepartureDTL_"]').text().trim() || "";
        const podLoc = $(row).find('[id*="PODL_"]').text().trim() || "";
        const arrivalDate = $(row).find('[id*="ArrivedDTL_"]').text().trim() || "";

        legs.push({
            pol: { location: polLoc, departureDate },
            pod: { location: podLoc, arrivalDate }
        });
    });

    const result = {};

    if (legs.length === 1) {
        // Simple direct route
        result.pol = legs[0].pol;
        result.pod = legs[0].pod;
    } else {
        result.pol = legs[0].pol;

        for (let i = 1; i < legs.length; i++) {
            result[`ts${i}`] = {
                location: legs[i].pol.location,
                arrivalDate: legs[i - 1].pod.arrivalDate,
                departureDate: legs[i].pol.departureDate
            };
        }

        result.pod = legs[legs.length - 1].pod;
    }

    return result;
};

const cleanContainerDetails = async (rawcontainerDetails, containersEvents) => {
    // Check if rawcontainerDetails exists and has at least one element
    if (!rawcontainerDetails || !rawcontainerDetails.length || !rawcontainerDetails[0]) {
        console.log('[12IH] cleanContainerDetails: rawcontainerDetails is empty or invalid');
        return { containerInfo: [] };
    }
    
    const $ = cheerio.load(rawcontainerDetails[0]);

    const containers = $("table.GridViewStyle tbody tr").map((i, row) => {
      const innerRow = $(row).find("table > tbody > tr");
      if (!innerRow.length) return null;
  
      const cells = innerRow.find("td");
  
      const containerNo = $(cells[1]).find("a").text().trim(); // 2nd <td>
      if (!containerNo || containerNo.includes("container no")) return null;
  
      const sealNo = $(cells[2]).text().trim();
      const size = $(cells[3]).find("span").eq(0).text().trim();
      const type = $(cells[3]).find("span").eq(1).text().trim();
      const sizeType = `${size} ${type}`.trim();
  
      return {
        containerNo,
        sealNo,
        size: sizeType || "Unknown",
        events: []
      };
    }).get().filter(Boolean);  

  // Safely process container events
  containersEvents.forEach((html, i) => {
    if (!containers[i] || !html) return;

    try {
      const $events = cheerio.load(html);
      const containerNo = containers[i].containerNo;

    containers[i].events = $events("table.GridViewStyle tbody tr").map((j, row) => {
      const cells = $events(row).find("td");
      const no = $events(cells[0]).text().trim();

      if (!no || isNaN(+no) || $events(cells[1]).text().trim() !== containerNo) return null;

      const rawDate = $events(cells[7]).text().trim();
      let formattedDate = "";
      if (rawDate) {
        const dateObj = new Date(rawDate);
        if (!isNaN(dateObj.getTime())) {
          formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")} ${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;
        } else {
          formattedDate = rawDate;
        }
      }

      return {
        No: +no,
        status: $events(cells[3]).text().trim() || "",
        location: $events(cells[4]).text().trim() || "",
        cntrState: $events(cells[6]).text().trim() || "",
        date: formattedDate || "",
        vessel: $events(cells[8]).text().trim() || ""
      };
    }).get().filter(Boolean);
    } catch (error) {
      console.error(`[12IH] Error processing container events for container ${i}: ${error.message}`);
      containers[i].events = [];
    }
  });

  return { containerInfo: containers };
};


const sinolinesScraping = async (task, browser, tabManager = null, userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36") => {
    const { tracking_number, code, type } = task;
    const taskId = `${code}-${tracking_number}-${Date.now()}`;
    
    // Validate tracking number
    if (!tracking_number || tracking_number.trim() === '') {
        console.error('[12IH] Empty or invalid tracking number provided');
        return {
            status: 'error',
            tracking_number: tracking_number || '',
            code: code || '',
            type: type || '',
            message: 'Empty or invalid tracking number provided',
            rawData: {}
        };
    }
    
    const rawData = {};
    let uniqueContainers = [];
    const containersEvents = [];
    const rawroute = [];
    const rawcontainerDetails = [];

    try {
        let page;
        if (tabManager) {
            page = await tabManager.createManagedPage(taskId);
        } else {
            page = await browser.newPage();
        }
        await page.setRequestInterception(true);
        await page.setUserAgent(userAgent);
        page.on("request", (req) => {
            if (req.resourceType() === "stylesheet" || req.resourceType() === "font" || req.resourceType() === "image" || req.resourceType() === "media") {
                req.abort();
            } else {
                req.continue();
            }
        });
        await page.goto(
            "https://ebusiness.sinolines.com.cn/snlebusiness/EQUERY/TrackingCargoE.aspx",
            { waitUntil: "domcontentloaded", timeout: 120000 }
        );

        try {
            await page.waitForSelector("#dl_seltype", { timeout: 30000 });

            try {
                const currentValue = await page.$eval("#dl_seltype", (el) => el.value);
                if (currentValue !== "cntrno") {
                    console.log(`[12IH] Trying direct postback execution for ${tracking_number}`);

                    await page.evaluate(() => {
                        const select = document.getElementById("dl_seltype");
                        select.value = "cntrno";

                        const event = new Event("change", { bubbles: true });
                        select.dispatchEvent(event);

                        // Execute the postback directly
                        if (typeof (window).__doPostBack === "function") {
                            (window).__doPostBack("dl_seltype", "");
                        }
                    });

                    console.log(`[12IH] Executed direct postback for ${tracking_number}`);
                }
            } catch (postbackError) {
                console.error(`[12IH] Direct postback failed: ${postbackError.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            await page.waitForSelector("#TbBlno", { timeout: 30000 });
            await page.click("#TbBlno", { clickCount: 3 });
            await page.keyboard.press("Delete");
            await page.type("#TbBlno", tracking_number);
            console.log(`[12IH] Entered tracking number: ${tracking_number}`);

            await page.waitForSelector("#BlnoListRetrieveBT", { timeout: 30000 });
            await page.click("#BlnoListRetrieveBT");
            console.log(`[12IH] Clicked search button for ${tracking_number}`);

            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log(`[12IH] Search results loaded for ${tracking_number}`);

            await page.waitForSelector("#CntrStateGridView", {
                timeout: 10000,
                visible: true
            });

            // Scrape all HTML content from the table
            const rawContainers = await page.evaluate(() => {
                const table = document.querySelector("#CntrStateGridView");
                if (table) {
                    return table.outerHTML;
                }
                return null;
            });

            if (rawContainers) {
                console.log(`[12IH] Successfully scraped container table for ${tracking_number}`);

                await page.waitForSelector("#CntrStateGridView", {
                    timeout: 1000,
                    visible: true
                });

                const containerDetails = await page.evaluate(() => {
                    const table = document.querySelector("#CntrStateGridView");
                    if (!table) return null;

                    const headers = Array.from(table.querySelectorAll("th"))
                        .map(th => th.textContent?.trim() || "");

                    const rows = Array.from(table.querySelectorAll("tr"))
                        .slice(1)
                        .map(row => {
                            const cells = Array.from(row.querySelectorAll("td"));
                            const rowData = {};
                            cells.forEach((cell, index) => {
                                if (headers[index]) {
                                    rowData[headers[index]] = cell.textContent?.trim() || "";
                                }
                            });
                            return rowData;
                        });

                    return { headers, rows };
                });

                if (containerDetails && containerDetails.rows) {
                    const containerColIndex = containerDetails.headers.findIndex(header =>
                        header.toLowerCase().includes("container") || header.toLowerCase().includes("cntr"));

                    if (containerColIndex !== -1) {
                        const containerKey = containerDetails.headers[containerColIndex];
                        uniqueContainers = [...new Set(
                            containerDetails.rows
                                .map(row => row[containerKey])
                                .filter(Boolean)
                        )];
                    }
                }

            } else {
                console.log(`[12IH] No container table found for ${tracking_number}`);
                rawData.error = "Container table not found";
            }

            await new Promise(resolve => setTimeout(resolve, 3000));

            await page.waitForSelector("#dl_seltype", { timeout: 3000 });

            if (uniqueContainers.length > 0) {
                const currentValue = await page.$eval("#dl_seltype", (el) => el.value);
                if (currentValue !== "blno") {
                    console.log(`[12IH] Trying direct postback execution for ${tracking_number}`);

                    await page.evaluate(() => {
                        const select = document.getElementById("dl_seltype") ;
                        select.value = "blno";

                        const event = new Event("change", { bubbles: true });
                        select.dispatchEvent(event);

                        if (typeof (window).__doPostBack === "function") {
                            (window).__doPostBack("dl_seltype", "");
                        }
                    });

                    console.log(`[12IH] Executed direct postback 2nd time for ${tracking_number}`);
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    for (const container of uniqueContainers) {
                        await page.waitForSelector("#CNTRNOTXT", { timeout: 30000 });
                        await page.click("#CNTRNOTXT", { clickCount: 3 });
                        await page.keyboard.press("Delete");
                        await page.type("#CNTRNOTXT", container);
                        await page.click("#BlnoListRetrieveBT");
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        try {
                            await page.waitForSelector("#BlnoListGridView", { timeout: 30000 });
                            console.log(`[12IH] BlnoListGridView found for container ${container}`);
                            // If we found the element, break the loop
                            break;
                        } catch (error) {
                            console.log(`[12IH] BlnoListGridView not found for container ${container}, trying next container`);
                            continue;
                        }
                    }

                    const containerLinks = await page.$$('a[id*="ContainerGridView_SelLinkButton_"]');
                    console.log(`[12IH] Found ${containerLinks.length} container links`);

                    for (let i = 0; i < containerLinks.length; i++) {
                        try {
                            const linkExists = await page.evaluate((index) => {
                                const links = document.querySelectorAll('a[id*="ContainerGridView_SelLinkButton_"]');
                                return links.length > index;
                            }, i);

                            if (!linkExists) {
                                console.log(`[12IH] Link at index ${i} no longer exists, skipping`);
                                continue;
                            }

                            const containerNumber = await page.evaluate((index) => {
                                const links = document.querySelectorAll('a[id*="ContainerGridView_SelLinkButton_"]');
                                if (links[index]) {
                                    const containerText = links[index].textContent;
                                    (links[index]).click();
                                    return containerText;
                                }
                                return null;
                            }, i);
                            if (!containerNumber) {
                                console.log(`[12IH] Could not find container link at index ${i}`);
                                continue;
                            }
                            console.log(`[12IH] Clicking on container link: ${containerNumber}`);

                            await new Promise(resolve => setTimeout(resolve, 2000));

                            console.log(`[12IH] Successfully loaded details for container: ${containerNumber}`);

                            await page.waitForSelector("#CntrStateGridView", {
                                timeout: 10000,
                                visible: true
                            });

                            const rawContainerEvents = await page.evaluate(() => {
                                const table = document.querySelector("#CntrStateGridView");
                                if (table) {
                                    return table.outerHTML;
                                }
                                return null;
                            });

                            if (rawContainerEvents) {
                                rawData.rawContainerEventsHTML = rawContainerEvents;
                                containersEvents.push(rawContainerEvents);
                            } else {
                                console.log(`[12IH] No container events found for ${containerNumber}`);
                            }

                            if (i === containerLinks.length - 1) {
                                const rawRoutes = await page.evaluate(() => {
                                    const table = document.querySelector("#BlnoListGridView");
                                    if (table) {
                                        return table.outerHTML;
                                    }
                                    return null;
                                });
                                if (rawRoutes) {
                                    rawroute.push(rawRoutes);
                                } else {
                                    console.log(`[12IH] No route found for ${containerNumber}`);
                                }

                                const containerDetails = await page.evaluate(() => {

                                    const table = document.querySelector("#ContainerGridView");
                                    if (table) {
                                        return table.outerHTML;
                                    }
                                    return null;
                                });
                                rawcontainerDetails.push(containerDetails);
                            }


                        } catch (error) {
                            console.error(`[12IH] Error clicking container link ${i}: ${error.message}`);
                            continue;
                        }
                    }
                }
            } else {
                console.error(`[12IH] Direct postback failed`);
            }

            // Only attempt to clean route if we have data
            if (rawroute && rawroute.length > 0) {
                const cleanedRoute = await cleanRoute(rawroute);
                rawData.cleanedRoute = cleanedRoute;
            } else {
                console.log(`[12IH] No route data available for ${tracking_number}`);
                rawData.cleanedRoute = null;
            }
            
            // Only attempt to clean container details if we have data
            if (rawcontainerDetails && rawcontainerDetails.length > 0) {
                const cleanedContainerDetails = await cleanContainerDetails(rawcontainerDetails, containersEvents);
                rawData.cleanedContainerDetails = cleanedContainerDetails;
            } else {
                console.log(`[12IH] No container details available for ${tracking_number}`);
                rawData.cleanedContainerDetails = { containerInfo: [] };
            }

        } catch (error) {
            console.error(`Error in select dropdown handling for trackingNo ${tracking_number}`, error?.message || JSON.stringify(error));
            throw error;
        }
    if (tabManager) {
        await tabManager.closePage(taskId);
      } else {
        await page.close();
      }
    } catch (error) {
        console.error(`Error in sinolinesScraping for trackingNo ${tracking_number}`, error?.message || JSON.stringify(error));
        rawData.isFailed = true;
        return {
            status: 'error',
            trackingNumber: task.tracking_number,
            code: task.code,
            type: task.type,   
            message: error?.message || 'Unknown error',
            rawData: rawData
        };
    }
    return {
        status: 'success',
        trackingNumber: task.tracking_number,
        code: task.code,
        type: task.type,
        rawData: rawData
    };
};


module.exports = { sinolinesScraping };


