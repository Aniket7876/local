class TabManager {
  constructor(browser) {
    this.browser = browser;
    this.activePages = [];
    this.rotationInterval = null;
    this.currentIndex = 0;
    this.rotationDelay = 500; // Focus rotation every 1 seconds
  }

  async createManagedPage(taskId) {
    const page = await this.browser.newPage();
    
    // Add to our simple list
    this.activePages.push({ page, taskId });
    
    // Start rotation if this is the first page
    if (this.activePages.length === 1) {
      this.startRotation();
    }
    
    // Remove from list when page closes
    page.on('close', () => {
      this.activePages = this.activePages.filter(p => p.page !== page);
      if (this.activePages.length === 0) {
        this.stopRotation();
      }
    });
    
    console.log(`[TabManager] Created tab for ${taskId}. Total tabs: ${this.activePages.length}`);
    return page;
  }

  startRotation() {
    if (this.rotationInterval) return;
    
    console.log('[TabManager] Starting simple tab rotation');
    this.rotationInterval = setInterval(() => {
      this.focusNextTab();
    }, this.rotationDelay);
  }

  focusNextTab() {
    if (this.activePages.length === 0) return;
    
    // Clean up any closed pages first
    this.activePages = this.activePages.filter(p => !p.page.isClosed());
    
    if (this.activePages.length === 0) {
      this.stopRotation();
      return;
    }
    
    // Get next page in rotation
    this.currentIndex = (this.currentIndex + 1) % this.activePages.length;
    const pageInfo = this.activePages[this.currentIndex];
    
    if (pageInfo && !pageInfo.page.isClosed()) {
      pageInfo.page.bringToFront().catch(err => {
        console.error(`[TabManager] Error focusing tab ${pageInfo.taskId}:`, err.message);
      });
      console.log(`[TabManager] Rotated focus to tab: ${pageInfo.taskId} (${this.currentIndex + 1}/${this.activePages.length})`);
    }
  }

  stopRotation() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
      console.log('[TabManager] Stopped tab rotation');
    }
  }

  async closePage(taskId) {
    const pageInfo = this.activePages.find(p => p.taskId === taskId);
    if (pageInfo && !pageInfo.page.isClosed()) {
      await pageInfo.page.close();
      console.log(`[TabManager] Closed tab for task: ${taskId}`);
    }
  }

  async closeAllPages() {
    this.stopRotation();
    
    const closePromises = this.activePages.map(pageInfo => {
      if (!pageInfo.page.isClosed()) {
        return pageInfo.page.close().catch(err => 
          console.error(`Error closing page ${pageInfo.taskId}:`, err)
        );
      }
    });
    
    await Promise.allSettled(closePromises);
    this.activePages = [];
    console.log('[TabManager] All tabs closed');
  }

  getActiveTabCount() {
    return this.activePages.length;
  }
}

module.exports = { TabManager };