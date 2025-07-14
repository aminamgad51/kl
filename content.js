// Ultra-Fast Content script for ETA Invoice Exporter - Maximum Performance Version
class ETAContentScript {
  constructor() {
    this.invoiceData = [];
    this.allPagesData = [];
    this.totalCount = 0;
    this.currentPage = 1;
    this.totalPages = 1;
    this.resultsPerPage = 50;
    this.isProcessingAllPages = false;
    this.progressCallback = null;
    this.domObserver = null;
    this.pageLoadTimeout = 8000; // Reduced to 8s
    this.networkInterceptor = null;
    this.cachedNetworkData = new Map();
    this.pageNavigationAttempts = 0;
    this.maxNavigationAttempts = 3;
    this.lastPageContent = '';
    this.stuckPageCounter = 0;
    this.init();
  }
  
  init() {
    console.log('ETA Exporter: Ultra-fast content script initialized');
    
    // Setup network interception first
    this.setupNetworkInterception();
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.scanForInvoices());
    } else {
      // Immediate scan without delay
      this.scanForInvoices();
    }
    
    this.setupOptimizedMutationObserver();
  }
  
  setupNetworkInterception() {
    // Intercept XHR requests to capture invoice data directly from API
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalFetch = window.fetch;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._url = url;
      this._method = method;
      return originalXHROpen.call(this, method, url, ...args);
    };
    
    XMLHttpRequest.prototype.send = function(data) {
      this.addEventListener('load', () => {
        if (this._url && this._url.includes('invoicing.eta.gov.eg') && 
            (this._url.includes('documents') || this._url.includes('invoice') || this._url.includes('search'))) {
          try {
            const responseData = JSON.parse(this.responseText);
            this.handleNetworkResponse(this._url, responseData);
          } catch (e) {
            // Not JSON, ignore
          }
        }
      });
      return originalXHRSend.call(this, data);
    }.bind(this);
    
    // Intercept fetch requests
    window.fetch = async function(url, options = {}) {
      const response = await originalFetch(url, options);
      
      if (url.includes && url.includes('invoicing.eta.gov.eg') && 
          (url.includes('documents') || url.includes('invoice') || url.includes('search'))) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          this.handleNetworkResponse(url, data);
        } catch (e) {
          // Not JSON or already consumed, ignore
        }
      }
      
      return response;
    }.bind(this);
  }
  
  handleNetworkResponse(url, data) {
    // Cache network responses for faster access
    const cacheKey = this.generateCacheKey(url);
    this.cachedNetworkData.set(cacheKey, {
      timestamp: Date.now(),
      data: data
    });
    
    // If this looks like invoice list data, extract it immediately
    if (this.isInvoiceListResponse(data)) {
      console.log('ETA Exporter: Found invoice data in network response');
      this.extractFromNetworkData(data);
      
      // Extract pagination info from network response
      this.extractPaginationFromNetwork(data);
    }
  }
  
  extractPaginationFromNetwork(data) {
    // Try to get pagination info from network response
    if (data.totalCount || data.total) {
      this.totalCount = data.totalCount || data.total;
    }
    
    if (data.currentPage || data.page) {
      this.currentPage = data.currentPage || data.page;
    }
    
    if (data.totalPages || data.pageCount) {
      this.totalPages = data.totalPages || data.pageCount;
    } else if (data.pageSize || data.size) {
      const pageSize = data.pageSize || data.size;
      this.totalPages = Math.ceil(this.totalCount / pageSize);
    }
    
    if (data.pageSize || data.size) {
      this.resultsPerPage = data.pageSize || data.size;
    }
    
    console.log(`ETA Exporter: Network pagination - Page ${this.currentPage}/${this.totalPages}, Total: ${this.totalCount}`);
  }
  
  generateCacheKey(url) {
    return url.replace(/[?&]_=\d+/, '').replace(/[?&]timestamp=\d+/, '');
  }
  
  isInvoiceListResponse(data) {
    return data && (
      (data.items && Array.isArray(data.items)) ||
      (data.documents && Array.isArray(data.documents)) ||
      (data.invoices && Array.isArray(data.invoices)) ||
      (data.result && Array.isArray(data.result)) ||
      (data.data && Array.isArray(data.data)) ||
      (Array.isArray(data) && data.length > 0 && (data[0].uuid || data[0].id))
    );
  }
  
  extractFromNetworkData(data) {
    let invoices = [];
    
    // Try different possible data structures
    if (data.items) invoices = data.items;
    else if (data.documents) invoices = data.documents;
    else if (data.invoices) invoices = data.invoices;
    else if (data.result) invoices = data.result;
    else if (data.data) invoices = data.data;
    else if (Array.isArray(data)) invoices = data;
    
    if (invoices.length > 0) {
      this.invoiceData = invoices.map((item, index) => this.transformNetworkDataToInvoice(item, index + 1));
      console.log(`ETA Exporter: Extracted ${this.invoiceData.length} invoices from network data`);
    }
  }
  
  transformNetworkDataToInvoice(networkItem, index) {
    return {
      index: index,
      pageNumber: this.currentPage,
      serialNumber: index,
      viewButton: 'عرض',
      documentType: networkItem.typeName || networkItem.documentType || 'فاتورة',
      documentVersion: networkItem.version || networkItem.documentVersion || '1.0',
      status: networkItem.status || networkItem.statusName || '',
      issueDate: networkItem.dateTimeIssued || networkItem.issueDate || networkItem.createdAt || '',
      submissionDate: networkItem.dateTimeReceived || networkItem.submissionDate || networkItem.dateTimeIssued || '',
      invoiceCurrency: networkItem.currency || 'EGP',
      invoiceValue: this.calculateInvoiceValue(networkItem),
      vatAmount: networkItem.vatAmount || networkItem.totalTaxAmount || '',
      taxDiscount: networkItem.taxDiscount || '0',
      totalInvoice: networkItem.total || networkItem.totalAmount || networkItem.netAmount || '',
      internalNumber: networkItem.internalId || networkItem.internalNumber || '',
      electronicNumber: networkItem.uuid || networkItem.electronicNumber || networkItem.id || '',
      sellerTaxNumber: networkItem.issuerTaxNumber || networkItem.sellerTaxNumber || '',
      sellerName: networkItem.issuerName || networkItem.sellerName || '',
      sellerAddress: networkItem.issuerAddress || networkItem.sellerAddress || 'غير محدد',
      buyerTaxNumber: networkItem.receiverTaxNumber || networkItem.buyerTaxNumber || '',
      buyerName: networkItem.receiverName || networkItem.buyerName || '',
      buyerAddress: networkItem.receiverAddress || networkItem.buyerAddress || 'غير محدد',
      purchaseOrderRef: networkItem.purchaseOrderReference || networkItem.submissionId || '',
      purchaseOrderDesc: networkItem.purchaseOrderDescription || '',
      salesOrderRef: networkItem.salesOrderReference || '',
      electronicSignature: 'موقع إلكترونياً',
      foodDrugGuide: networkItem.foodDrugGuide || '',
      externalLink: this.generateExternalLink({ 
        electronicNumber: networkItem.uuid || networkItem.id,
        submissionId: networkItem.submissionId 
      }),
      issueTime: networkItem.timeIssued || '',
      totalAmount: networkItem.total || networkItem.totalAmount || '',
      currency: networkItem.currency || 'EGP',
      submissionId: networkItem.submissionId || '',
      details: []
    };
  }
  
  calculateInvoiceValue(networkItem) {
    const total = parseFloat(networkItem.total || networkItem.totalAmount || 0);
    const vat = parseFloat(networkItem.vatAmount || networkItem.totalTaxAmount || 0);
    
    if (total > 0 && vat > 0) {
      return this.formatAmount(total - vat);
    }
    
    return networkItem.netAmount || networkItem.subtotal || this.formatAmount(total);
  }
  
  setupOptimizedMutationObserver() {
    // Ultra-targeted mutation observer
    this.observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (this.isInvoiceRelatedNode(node)) {
                shouldRescan = true;
                break;
              }
            }
          }
        }
        if (shouldRescan) break;
      }
      
      if (shouldRescan && !this.isProcessingAllPages) {
        // Immediate rescan without debounce for maximum speed
        this.scanForInvoices();
      }
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
  }
  
  isInvoiceRelatedNode(node) {
    const invoiceSelectors = [
      'ms-DetailsRow',
      'ms-List-cell',
      'ms-DetailsList',
      'internalId-link',
      'griCellTitle'
    ];
    
    return invoiceSelectors.some(selector => 
      node.classList?.contains(selector) || 
      node.querySelector?.(`.${selector}`)
    );
  }
  
  async scanForInvoices() {
    try {
      console.log('ETA Exporter: Starting ultra-fast invoice scan...');
      
      // First, try to get data from network cache
      const networkData = this.tryGetFromNetworkCache();
      if (networkData && networkData.length > 0) {
        this.invoiceData = networkData;
        this.extractPaginationInfo();
        console.log(`ETA Exporter: Used cached network data: ${this.invoiceData.length} invoices`);
        return;
      }
      
      // Fallback to DOM scraping with maximum speed optimizations
      this.invoiceData = [];
      this.extractPaginationInfo();
      
      // Use most efficient DOM querying
      const rows = await this.getVisibleInvoiceRowsOptimized();
      console.log(`ETA Exporter: Found ${rows.length} visible invoice rows on page ${this.currentPage}`);
      
      if (rows.length === 0) {
        console.warn('ETA Exporter: No invoice rows found. Trying alternative selectors...');
        const alternativeRows = await this.getAlternativeInvoiceRowsOptimized();
        console.log(`ETA Exporter: Found ${alternativeRows.length} rows with alternative selectors`);
        
        // Process in larger batches for speed
        await this.processBatchedRows(alternativeRows);
      } else {
        await this.processBatchedRows(rows);
      }
      
      console.log(`ETA Exporter: Successfully extracted ${this.invoiceData.length} valid invoices from page ${this.currentPage}`);
      
    } catch (error) {
      console.error('ETA Exporter: Error scanning for invoices:', error);
    }
  }
  
  tryGetFromNetworkCache() {
    // Look for recent cached network data
    const now = Date.now();
    const maxAge = 15000; // Reduced to 15 seconds for faster updates
    
    for (const [key, cached] of this.cachedNetworkData.entries()) {
      if (now - cached.timestamp < maxAge && this.isInvoiceListResponse(cached.data)) {
        return this.extractInvoicesFromCachedData(cached.data);
      }
    }
    
    return null;
  }
  
  extractInvoicesFromCachedData(data) {
    let invoices = [];
    
    if (data.items) invoices = data.items;
    else if (data.documents) invoices = data.documents;
    else if (data.invoices) invoices = data.invoices;
    else if (data.result) invoices = data.result;
    else if (data.data) invoices = data.data;
    else if (Array.isArray(data)) invoices = data;
    
    return invoices.map((item, index) => this.transformNetworkDataToInvoice(item, index + 1));
  }
  
  async getVisibleInvoiceRowsOptimized() {
    // Use most efficient selectors first
    const selectors = [
      '.ms-DetailsRow[role="row"]',
      '.ms-List-cell[role="gridcell"]',
      '[data-list-index]',
      '.ms-DetailsRow',
      '[role="row"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) continue;
      
      const visibleRows = Array.from(elements).filter(row => 
        this.isRowVisibleOptimized(row) && this.hasInvoiceDataOptimized(row)
      );
      
      if (visibleRows.length > 0) {
        console.log(`ETA Exporter: Found ${visibleRows.length} rows using selector: ${selector}`);
        return visibleRows;
      }
    }
    
    return [];
  }
  
  async getAlternativeInvoiceRowsOptimized() {
    const alternativeSelectors = [
      'tr[role="row"]',
      '.ms-List-cell',
      '[data-automation-key]',
      '.ms-DetailsRow-cell',
      'div[role="gridcell"]'
    ];
    
    const allRows = new Set();
    
    for (const selector of alternativeSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const row = element.closest('[role="row"]') || element.parentElement;
        if (row && this.hasInvoiceDataOptimized(row) && this.isRowVisibleOptimized(row)) {
          allRows.add(row);
        }
      }
    }
    
    return Array.from(allRows);
  }
  
  isRowVisibleOptimized(row) {
    if (!row) return false;
    
    const style = row.style;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    
    const rect = row.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  
  hasInvoiceDataOptimized(row) {
    if (!row) return false;
    
    const cachedElements = row._invoiceElements || this.cacheInvoiceElements(row);
    
    return !!(cachedElements.electronicNumber?.textContent?.trim() || 
              cachedElements.internalNumber?.textContent?.trim() || 
              cachedElements.totalAmount?.textContent?.trim());
  }
  
  cacheInvoiceElements(row) {
    const elements = {
      electronicNumber: row.querySelector('.internalId-link a, [data-automation-key="uuid"] a, .griCellTitle'),
      internalNumber: row.querySelector('.griCellSubTitle, [data-automation-key="uuid"] .griCellSubTitle'),
      totalAmount: row.querySelector('[data-automation-key="total"], .griCellTitleGray')
    };
    
    row._invoiceElements = elements;
    return elements;
  }
  
  async processBatchedRows(rows) {
    const batchSize = 20; // Increased batch size for speed
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map((row, batchIndex) => {
        const globalIndex = i + batchIndex + 1;
        return this.extractDataFromRowOptimized(row, globalIndex);
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Filter valid results and add to invoice data
      const validInvoices = batchResults.filter(invoice => this.isValidInvoiceData(invoice));
      this.invoiceData.push(...validInvoices);
      
      // No delay between batches for maximum speed
    }
  }
  
  async extractDataFromRowOptimized(row, index) {
    const invoice = {
      index: index,
      pageNumber: this.currentPage,
      serialNumber: index,
      viewButton: 'عرض',
      documentType: 'فاتورة',
      documentVersion: '1.0',
      status: '',
      issueDate: '',
      submissionDate: '',
      invoiceCurrency: 'EGP',
      invoiceValue: '',
      vatAmount: '',
      taxDiscount: '0',
      totalInvoice: '',
      internalNumber: '',
      electronicNumber: '',
      sellerTaxNumber: '',
      sellerName: '',
      sellerAddress: '',
      buyerTaxNumber: '',
      buyerName: '',
      buyerAddress: '',
      purchaseOrderRef: '',
      purchaseOrderDesc: '',
      salesOrderRef: '',
      electronicSignature: 'موقع إلكترونياً',
      foodDrugGuide: '',
      externalLink: '',
      issueTime: '',
      totalAmount: '',
      currency: 'EGP',
      submissionId: '',
      details: []
    };
    
    try {
      const cachedElements = row._invoiceElements || this.cacheInvoiceElements(row);
      
      // Extract using optimized methods in parallel
      await Promise.all([
        this.extractUsingDataAttributesOptimized(row, invoice, cachedElements),
        this.extractUsingCellPositionsOptimized(row, invoice),
        this.extractUsingTextContentOptimized(row, invoice)
      ]);
      
      // Generate external link if we have electronic number
      if (invoice.electronicNumber) {
        invoice.externalLink = this.generateExternalLink(invoice);
      }
      
    } catch (error) {
      console.warn(`ETA Exporter: Error extracting data from row ${index}:`, error);
    }
    
    return invoice;
  }
  
  async extractUsingDataAttributesOptimized(row, invoice, cachedElements) {
    const cells = row.querySelectorAll('.ms-DetailsRow-cell, [data-automation-key]');
    
    // Process cells in parallel
    const cellProcessingPromises = Array.from(cells).map(async (cell) => {
      const key = cell.getAttribute('data-automation-key');
      
      switch (key) {
        case 'uuid':
          const electronicLink = cachedElements.electronicNumber || cell.querySelector('.internalId-link a.griCellTitle, a');
          if (electronicLink) {
            invoice.electronicNumber = electronicLink.textContent?.trim() || '';
          }
          
          const internalNumberElement = cachedElements.internalNumber || cell.querySelector('.griCellSubTitle');
          if (internalNumberElement) {
            invoice.internalNumber = internalNumberElement.textContent?.trim() || '';
          }
          break;
          
        case 'dateTimeReceived':
          const dateElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const timeElement = cell.querySelector('.griCellSubTitle');
          
          if (dateElement) {
            invoice.issueDate = dateElement.textContent?.trim() || '';
            invoice.submissionDate = invoice.issueDate;
          }
          if (timeElement) {
            invoice.issueTime = timeElement.textContent?.trim() || '';
          }
          break;
          
        case 'typeName':
          const typeElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const versionElement = cell.querySelector('.griCellSubTitle');
          
          if (typeElement) {
            invoice.documentType = typeElement.textContent?.trim() || 'فاتورة';
          }
          if (versionElement) {
            invoice.documentVersion = versionElement.textContent?.trim() || '1.0';
          }
          break;
          
        case 'total':
          const totalElement = cachedElements.totalAmount || cell.querySelector('.griCellTitleGray, .griCellTitle');
          if (totalElement) {
            const totalText = totalElement.textContent?.trim() || '';
            invoice.totalAmount = totalText;
            invoice.totalInvoice = totalText;
            
            // Calculate VAT and invoice value
            const totalValue = this.parseAmount(totalText);
            if (totalValue > 0) {
              const vatRate = 0.14;
              const vatAmount = (totalValue * vatRate) / (1 + vatRate);
              const invoiceValue = totalValue - vatAmount;
              
              invoice.vatAmount = this.formatAmount(vatAmount);
              invoice.invoiceValue = this.formatAmount(invoiceValue);
            }
          }
          break;
          
        case 'issuerName':
          const sellerNameElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const sellerTaxElement = cell.querySelector('.griCellSubTitle');
          
          if (sellerNameElement) {
            invoice.sellerName = sellerNameElement.textContent?.trim() || '';
          }
          if (sellerTaxElement) {
            invoice.sellerTaxNumber = sellerTaxElement.textContent?.trim() || '';
          }
          
          if (invoice.sellerName && !invoice.sellerAddress) {
            invoice.sellerAddress = 'غير محدد';
          }
          break;
          
        case 'receiverName':
          const buyerNameElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const buyerTaxElement = cell.querySelector('.griCellSubTitle');
          
          if (buyerNameElement) {
            invoice.buyerName = buyerNameElement.textContent?.trim() || '';
          }
          if (buyerTaxElement) {
            invoice.buyerTaxNumber = buyerTaxElement.textContent?.trim() || '';
          }
          
          if (invoice.buyerName && !invoice.buyerAddress) {
            invoice.buyerAddress = 'غير محدد';
          }
          break;
          
        case 'submission':
          const submissionLink = cell.querySelector('a.submissionId-link, a');
          if (submissionLink) {
            invoice.submissionId = submissionLink.textContent?.trim() || '';
            invoice.purchaseOrderRef = invoice.submissionId;
          }
          break;
          
        case 'status':
          const validRejectedDiv = cell.querySelector('.horizontal.valid-rejected');
          if (validRejectedDiv) {
            const validStatus = validRejectedDiv.querySelector('.status-Valid');
            const rejectedStatus = validRejectedDiv.querySelector('.status-Rejected');
            if (validStatus && rejectedStatus) {
              invoice.status = `${validStatus.textContent?.trim()} → ${rejectedStatus.textContent?.trim()}`;
            }
          } else {
            const textStatus = cell.querySelector('.textStatus, .griCellTitle, .griCellTitleGray');
            if (textStatus) {
              invoice.status = textStatus.textContent?.trim() || '';
            }
          }
          break;
      }
    });
    
    await Promise.all(cellProcessingPromises);
  }
  
  async extractUsingCellPositionsOptimized(row, invoice) {
    const cells = row.querySelectorAll('.ms-DetailsRow-cell, td, [role="gridcell"]');
    
    if (cells.length >= 8) {
      const extractionPromises = [];
      
      if (!invoice.electronicNumber) {
        extractionPromises.push(this.extractElectronicNumber(cells[0], invoice));
      }
      
      if (!invoice.totalAmount) {
        extractionPromises.push(this.extractTotalAmount(cells, invoice));
      }
      
      if (!invoice.issueDate) {
        extractionPromises.push(this.extractIssueDate(cells, invoice));
      }
      
      await Promise.all(extractionPromises);
    }
  }
  
  async extractElectronicNumber(cell, invoice) {
    const link = cell.querySelector('a');
    if (link) {
      invoice.electronicNumber = link.textContent?.trim() || '';
    }
  }
  
  async extractTotalAmount(cells, invoice) {
    for (let i = 2; i < Math.min(6, cells.length); i++) {
      const cellText = cells[i].textContent?.trim() || '';
      if (cellText.includes('EGP') || /^\d+[\d,]*\.?\d*$/.test(cellText.replace(/[,٬]/g, ''))) {
        invoice.totalAmount = cellText;
        invoice.totalInvoice = cellText;
        break;
      }
    }
  }
  
  async extractIssueDate(cells, invoice) {
    for (let i = 1; i < Math.min(4, cells.length); i++) {
      const cellText = cells[i].textContent?.trim() || '';
      if (cellText.includes('/') && cellText.length >= 8) {
        invoice.issueDate = cellText;
        invoice.submissionDate = cellText;
        break;
      }
    }
  }
  
  async extractUsingTextContentOptimized(row, invoice) {
    const allText = row.textContent || '';
    
    // Use parallel regex matching
    const patterns = [
      { regex: /[A-Z0-9]{20,30}/, field: 'electronicNumber' },
      { regex: /\d{1,2}\/\d{1,2}\/\d{4}/, field: 'issueDate' },
      { regex: /\d+[,٬]?\d*\.?\d*\s*EGP/, field: 'totalAmount' }
    ];
    
    patterns.forEach(({ regex, field }) => {
      if (!invoice[field]) {
        const match = allText.match(regex);
        if (match) {
          invoice[field] = match[0];
          if (field === 'issueDate') {
            invoice.submissionDate = match[0];
          } else if (field === 'totalAmount') {
            invoice.totalInvoice = match[0];
          }
        }
      }
    });
  }
  
  extractPaginationInfo() {
    try {
      // First try to get from network data
      if (this.totalCount > 0 && this.totalPages > 1) {
        console.log(`ETA Exporter: Using network pagination - Page ${this.currentPage} of ${this.totalPages}, Total: ${this.totalCount} invoices`);
        return;
      }
      
      this.totalCount = this.extractTotalCount();
      this.currentPage = this.extractCurrentPage();
      this.resultsPerPage = this.detectResultsPerPage();
      this.totalPages = this.calculateTotalPages();
      
      // Validation and correction
      this.currentPage = Math.max(this.currentPage, 1);
      this.totalPages = Math.max(this.totalPages, this.currentPage);
      this.totalCount = Math.max(this.totalCount, this.invoiceData.length);
      
      console.log(`ETA Exporter: DOM pagination - Page ${this.currentPage} of ${this.totalPages}, Total: ${this.totalCount} invoices (${this.resultsPerPage} per page)`);
      
    } catch (error) {
      console.warn('ETA Exporter: Error extracting pagination info:', error);
      this.currentPage = 1;
      this.totalPages = this.findMaxPageNumber() || 1;
      this.totalCount = this.invoiceData.length;
    }
  }
  
  calculateTotalPages() {
    if (this.totalCount > 0 && this.resultsPerPage > 0) {
      return Math.ceil(this.totalCount / this.resultsPerPage);
    }
    
    // Fallback: find the highest page number visible
    const maxVisiblePage = this.findMaxPageNumber();
    
    // If we're on a page higher than what we calculated, use the visible max
    return Math.max(maxVisiblePage, Math.ceil(this.totalCount / this.resultsPerPage));
  }
  
  extractTotalCount() {
    // Try multiple strategies to find total count
    const strategies = [
      () => this.findTotalInResultsText(),
      () => this.findTotalInPaginationArea(),
      () => this.findTotalInCommandBar(),
      () => this.findTotalInStatusText()
    ];
    
    for (const strategy of strategies) {
      try {
        const count = strategy();
        if (count > 0) {
          console.log(`ETA Exporter: Found total count ${count}`);
          return count;
        }
      } catch (e) {
        // Continue to next strategy
      }
    }
    
    return 0;
  }
  
  findTotalInResultsText() {
    const resultElements = document.querySelectorAll('*');
    
    for (const element of resultElements) {
      const text = element.textContent || '';
      
      // Look for "Results: X" pattern
      const resultsMatch = text.match(/Results:\s*(\d+)/i);
      if (resultsMatch) {
        return parseInt(resultsMatch[1]);
      }
      
      // Look for other patterns
      const patterns = [
        /(\d+)\s*results/i,
        /total:\s*(\d+)/i,
        /النتائج:\s*(\d+)/i,
        /(\d+)\s*نتيجة/i,
        /من\s*(\d+)/i,
        /إجمالي:\s*(\d+)/i
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          return parseInt(match[1]);
        }
      }
    }
    
    return 0;
  }
  
  findTotalInPaginationArea() {
    const paginationSelectors = [
      '.ms-CommandBar',
      '[class*="pagination"]',
      '[class*="pager"]',
      '.ms-Nav',
      '[role="navigation"]'
    ];
    
    for (const selector of paginationSelectors) {
      const paginationArea = document.querySelector(selector);
      if (paginationArea) {
        const text = paginationArea.textContent || '';
        
        // Look for "X - Y of Z" pattern
        const match = text.match(/(\d+)\s*-\s*(\d+)\s*of\s*(\d+)|(\d+)\s*-\s*(\d+)\s*من\s*(\d+)/i);
        if (match) {
          return parseInt(match[3] || match[6]);
        }
      }
    }
    
    return 0;
  }
  
  findTotalInCommandBar() {
    const commandBars = document.querySelectorAll('.ms-CommandBar, .commandBar');
    
    for (const bar of commandBars) {
      const text = bar.textContent || '';
      const match = text.match(/(\d+)\s*items?|(\d+)\s*عنصر/i);
      if (match) {
        return parseInt(match[1] || match[2]);
      }
    }
    
    return 0;
  }
  
  findTotalInStatusText() {
    const statusElements = document.querySelectorAll('[class*="status"], [class*="info"], .ms-MessageBar');
    
    for (const element of statusElements) {
      const text = element.textContent || '';
      const match = text.match(/showing\s*(\d+)\s*of\s*(\d+)|عرض\s*(\d+)\s*من\s*(\d+)/i);
      if (match) {
        return parseInt(match[2] || match[4]);
      }
    }
    
    return 0;
  }
  
  detectResultsPerPage() {
    const currentPageRows = this.invoiceData.length;
    
    if (this.currentPage < this.totalPages && currentPageRows > 0) {
      return currentPageRows;
    }
    
    const commonPageSizes = [10, 20, 25, 50, 100];
    
    if (currentPageRows > 0) {
      for (const size of commonPageSizes) {
        if (currentPageRows <= size) {
          return size;
        }
      }
      return currentPageRows;
    }
    
    return 50;
  }
  
  extractCurrentPage() {
    // Try multiple strategies to find current page
    const strategies = [
      () => this.findActivePageButton(),
      () => this.findCurrentPageInPagination(),
      () => this.findPageInURL()
    ];
    
    for (const strategy of strategies) {
      try {
        const page = strategy();
        if (page > 0) {
          return page;
        }
      } catch (e) {
        // Continue to next strategy
      }
    }
    
    return 1;
  }
  
  findActivePageButton() {
    const activePageSelectors = [
      '.ms-Button--primary[aria-pressed="true"]',
      '[aria-current="page"]',
      '.active',
      '.selected',
      '.current',
      '[class*="active"]',
      '[class*="selected"]'
    ];
    
    for (const selector of activePageSelectors) {
      const activeButton = document.querySelector(selector);
      if (activeButton) {
        const pageText = activeButton.textContent?.trim();
        const pageNum = parseInt(pageText);
        if (!isNaN(pageNum) && pageNum > 0) {
          return pageNum;
        }
      }
    }
    
    return 0;
  }
  
  findCurrentPageInPagination() {
    const pageButtons = document.querySelectorAll('button, a');
    for (const button of pageButtons) {
      const text = button.textContent?.trim();
      const pageNum = parseInt(text);
      
      if (!isNaN(pageNum) && pageNum > 0) {
        const classes = button.className || '';
        const ariaPressed = button.getAttribute('aria-pressed');
        const ariaCurrent = button.getAttribute('aria-current');
        
        if (ariaPressed === 'true' || ariaCurrent === 'page' || 
            classes.includes('active') || classes.includes('selected') ||
            classes.includes('primary')) {
          return pageNum;
        }
      }
    }
    
    return 0;
  }
  
  findPageInURL() {
    const url = window.location.href;
    const pageMatch = url.match(/[?&]page=(\d+)|[?&]p=(\d+)/i);
    if (pageMatch) {
      return parseInt(pageMatch[1] || pageMatch[2]);
    }
    
    return 0;
  }
  
  findMaxPageNumber() {
    const pageButtons = document.querySelectorAll('button, a');
    let maxPage = 1;
    
    pageButtons.forEach(btn => {
      const buttonText = btn.textContent?.trim();
      const pageNum = parseInt(buttonText);
      
      if (!isNaN(pageNum) && pageNum > maxPage && pageNum <= 100) { // Reasonable upper limit
        maxPage = pageNum;
      }
    });
    
    return maxPage;
  }
  
  parseAmount(amountText) {
    if (!amountText) return 0;
    const cleanText = amountText.replace(/[,٬\sEGP]/g, '').replace(/[^\d.]/g, '');
    return parseFloat(cleanText) || 0;
  }
  
  formatAmount(amount) {
    if (!amount || amount === 0) return '0';
    return amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }
  
  generateExternalLink(invoice) {
    if (!invoice.electronicNumber) return '';
    
    let shareId = '';
    if (invoice.submissionId && invoice.submissionId.length > 10) {
      shareId = invoice.submissionId;
    } else {
      shareId = invoice.electronicNumber.replace(/[^A-Z0-9]/g, '').substring(0, 26);
    }
    
    return `https://invoicing.eta.gov.eg/documents/${invoice.electronicNumber}/share/${shareId}`;
  }
  
  isValidInvoiceData(invoice) {
    return !!(invoice.electronicNumber || invoice.internalNumber || invoice.totalAmount);
  }
  
  async getAllPagesData(options = {}) {
    try {
      this.isProcessingAllPages = true;
      this.allPagesData = [];
      this.pageNavigationAttempts = 0;
      this.stuckPageCounter = 0;
      
      console.log(`ETA Exporter: Starting ultra-fast ALL pages loading. Total invoices: ${this.totalCount}`);
      
      await this.navigateToFirstPageOptimized();
      
      let processedInvoices = 0;
      let currentPageNum = 1;
      let consecutiveEmptyPages = 0;
      let maxConsecutiveEmpty = 3;
      
      while (processedInvoices < this.totalCount && currentPageNum <= this.totalPages && consecutiveEmptyPages < maxConsecutiveEmpty) {
        try {
          console.log(`ETA Exporter: Processing page ${currentPageNum}...`);
          
          if (this.progressCallback) {
            this.progressCallback({
              currentPage: currentPageNum,
              totalPages: this.totalPages,
              message: `جاري معالجة الصفحة ${currentPageNum}... (${processedInvoices}/${this.totalCount} فاتورة)`,
              percentage: this.totalCount > 0 ? (processedInvoices / this.totalCount) * 100 : 0
            });
          }
          
          // Check if we're stuck on the same page
          const currentPageContent = document.body.textContent;
          if (currentPageContent === this.lastPageContent) {
            this.stuckPageCounter++;
            if (this.stuckPageCounter >= 3) {
              console.log('ETA Exporter: Detected stuck on same page, breaking');
              break;
            }
          } else {
            this.stuckPageCounter = 0;
            this.lastPageContent = currentPageContent;
          }
          
          await this.waitForPageLoadCompleteOptimized();
          
          this.scanForInvoices();
          
          if (this.invoiceData.length > 0) {
            const pageData = this.invoiceData.map((invoice, index) => ({
              ...invoice,
              pageNumber: currentPageNum,
              serialNumber: processedInvoices + index + 1,
              globalIndex: processedInvoices + index + 1
            }));
            
            this.allPagesData.push(...pageData);
            processedInvoices += this.invoiceData.length;
            consecutiveEmptyPages = 0;
            
            console.log(`ETA Exporter: Page ${currentPageNum} processed, collected ${this.invoiceData.length} invoices. Total: ${processedInvoices}/${this.totalCount}`);
          } else {
            consecutiveEmptyPages++;
            console.warn(`ETA Exporter: No invoices found on page ${currentPageNum} (${consecutiveEmptyPages}/${maxConsecutiveEmpty} consecutive empty)`);
          }
          
          // Check if we've reached the end
          if (processedInvoices >= this.totalCount) {
            console.log(`ETA Exporter: Successfully loaded all ${processedInvoices} invoices!`);
            break;
          }
          
          // Check if we've reached the last page
          if (currentPageNum >= this.totalPages) {
            console.log(`ETA Exporter: Reached last page (${this.totalPages})`);
            break;
          }
          
          const navigatedToNext = await this.navigateToNextPageOptimized();
          if (!navigatedToNext) {
            console.log('ETA Exporter: Cannot navigate to next page, stopping');
            break;
          }
          
          currentPageNum++;
          
          // Ultra-minimal delay between pages
          await this.delay(200); // Reduced to 200ms
          
        } catch (error) {
          console.error(`Error processing page ${currentPageNum}:`, error);
          
          // Try to continue to next page
          const navigatedToNext = await this.navigateToNextPageOptimized();
          if (!navigatedToNext) {
            break;
          }
          currentPageNum++;
        }
      }
      
      console.log(`ETA Exporter: Completed! Loaded ${this.allPagesData.length} invoices out of ${this.totalCount} total.`);
      
      return {
        success: true,
        data: this.allPagesData,
        totalProcessed: this.allPagesData.length,
        expectedTotal: this.totalCount
      };
      
    } catch (error) {
      console.error('ETA Exporter: Error getting all pages data:', error);
      return { 
        success: false, 
        data: this.allPagesData,
        error: error.message,
        totalProcessed: this.allPagesData.length
      };
    } finally {
      this.isProcessingAllPages = false;
    }
  }
  
  async navigateToFirstPageOptimized() {
    console.log('ETA Exporter: Navigating to first page...');
    
    // Try to click page 1 button first
    const pageButtons = document.querySelectorAll('button, a');
    for (const button of pageButtons) {
      const buttonText = button.textContent?.trim();
      if (buttonText === '1') {
        console.log('ETA Exporter: Clicking page 1 button');
        button.click();
        await this.delay(500);
        await this.waitForPageLoadCompleteOptimized();
        this.extractPaginationInfo();
        return;
      }
    }
    
    // If already on page 1, just extract pagination info
    this.extractPaginationInfo();
    if (this.currentPage === 1) {
      console.log('ETA Exporter: Already on page 1');
      return;
    }
    
    // Navigate to previous pages until we reach page 1
    while (this.currentPage > 1) {
      const navigated = await this.navigateToPreviousPageOptimized();
      if (!navigated) break;
      await this.delay(500);
      await this.waitForPageLoadCompleteOptimized();
      this.extractPaginationInfo();
    }
  }
  
  async navigateToNextPageOptimized() {
    console.log('ETA Exporter: Attempting to navigate to next page...');
    
    // Reset navigation attempts for each page
    this.pageNavigationAttempts = 0;
    
    while (this.pageNavigationAttempts < this.maxNavigationAttempts) {
      this.pageNavigationAttempts++;
      
      // Strategy 1: Find and click next button
      const nextButton = this.findNextButtonOptimized();
      if (nextButton && !nextButton.disabled) {
        console.log('ETA Exporter: Found next button, clicking...');
        nextButton.click();
        await this.delay(500);
        return true;
      }
      
      // Strategy 2: Find specific page number button
      const currentPageNum = this.currentPage;
      const nextPageNum = currentPageNum + 1;
      
      const pageButtons = document.querySelectorAll('button, a');
      for (const button of pageButtons) {
        const buttonText = button.textContent?.trim();
        if (parseInt(buttonText) === nextPageNum) {
          console.log(`ETA Exporter: Found page ${nextPageNum} button, clicking...`);
          button.click();
          await this.delay(500);
          return true;
        }
      }
      
      // Strategy 3: Look for any next-like button
      for (const button of pageButtons) {
        const buttonText = button.textContent?.toLowerCase().trim();
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        
        if (buttonText.includes('next') || buttonText.includes('التالي') || 
            buttonText === '>' || buttonText === '»' ||
            ariaLabel.includes('next') || ariaLabel.includes('التالي')) {
          
          if (!button.disabled && !button.getAttribute('disabled')) {
            console.log('ETA Exporter: Found potential next button, clicking...');
            button.click();
            await this.delay(500);
            return true;
          }
        }
      }
      
      // If we can't find a next button, we might be at the end
      console.log(`ETA Exporter: No next page navigation found (attempt ${this.pageNavigationAttempts}/${this.maxNavigationAttempts})`);
      
      if (this.pageNavigationAttempts < this.maxNavigationAttempts) {
        await this.delay(1000); // Wait a bit before retrying
      }
    }
    
    console.log('ETA Exporter: Failed to navigate to next page after all attempts');
    return false;
  }
  
  findNextButtonOptimized() {
    const nextSelectors = [
      'button[aria-label*="Next"]:not([disabled])',
      'button[aria-label*="next"]:not([disabled])',
      'button[title*="Next"]:not([disabled])',
      'button[title*="next"]:not([disabled])',
      'button[aria-label*="التالي"]:not([disabled])',
      'button:has([data-icon-name="ChevronRight"]):not([disabled])',
      'button:has([class*="chevron-right"]):not([disabled])',
      '.ms-Button:has([data-icon-name="ChevronRight"]):not([disabled])'
    ];
    
    for (const selector of nextSelectors) {
      try {
        const button = document.querySelector(selector);
        if (button) {
          const style = window.getComputedStyle(button);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return button;
          }
        }
      } catch (e) {
        // Ignore selector errors
      }
    }
    
    // Fallback: look for buttons with right arrow icons
    const allButtons = document.querySelectorAll('button:not([disabled])');
    for (const button of allButtons) {
      const hasRightArrow = button.querySelector('[data-icon-name="ChevronRight"], [class*="chevron-right"], [class*="arrow-right"]');
      if (hasRightArrow) {
        return button;
      }
      
      const text = button.textContent?.toLowerCase() || '';
      if (text.includes('next') || text.includes('التالي') || text === '>' || text === '»') {
        return button;
      }
    }
    
    return null;
  }
  
  async navigateToPreviousPageOptimized() {
    const prevSelectors = [
      'button[aria-label*="Previous"]:not([disabled])',
      'button[aria-label*="previous"]:not([disabled])',
      'button[title*="Previous"]:not([disabled])',
      'button[title*="previous"]:not([disabled])',
      'button[aria-label*="السابق"]:not([disabled])',
      'button:has([data-icon-name="ChevronLeft"]):not([disabled])',
      'button:has([class*="chevron-left"]):not([disabled])',
      '.ms-Button:has([data-icon-name="ChevronLeft"]):not([disabled])'
    ];
    
    for (const selector of prevSelectors) {
      try {
        const button = document.querySelector(selector);
        if (button) {
          const style = window.getComputedStyle(button);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            console.log('ETA Exporter: Clicking previous button');
            button.click();
            await this.delay(500);
            return true;
          }
        }
      } catch (e) {
        // Ignore selector errors
      }
    }
    
    console.warn('ETA Exporter: No previous button found');
    return false;
  }
  
  async waitForPageLoadCompleteOptimized() {
    console.log('ETA Exporter: Waiting for ultra-fast page load...');
    
    // Use Promise.race for fastest response
    await Promise.race([
      this.waitForLoadingIndicatorsToDisappear(),
      this.waitForInvoiceRowsToAppear(),
      this.delay(5000) // Maximum wait time reduced to 5s
    ]);
    
    // Minimal DOM stability wait
    await this.delay(300); // Reduced from 1000ms to 300ms
    
    console.log('ETA Exporter: Ultra-fast page load completed');
  }
  
  async waitForLoadingIndicatorsToDisappear() {
    return this.waitForConditionOptimized(() => {
      const loadingIndicators = document.querySelectorAll(
        '.LoadingIndicator, .ms-Spinner, [class*="loading"], [class*="spinner"], .ms-Shimmer'
      );
      const isLoading = Array.from(loadingIndicators).some(el => 
        el.offsetParent !== null && 
        window.getComputedStyle(el).display !== 'none'
      );
      return !isLoading;
    }, 5000);
  }
  
  async waitForInvoiceRowsToAppear() {
    return this.waitForConditionOptimized(() => {
      const rows = this.getVisibleInvoiceRowsOptimized();
      return rows.length > 0;
    }, 5000);
  }
  
  async waitForConditionOptimized(condition, timeout = 5000) {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms for maximum responsiveness
    
    while (Date.now() - startTime < timeout) {
      try {
        if (await condition()) {
          return true;
        }
      } catch (error) {
        // Ignore errors in condition check
      }
      await this.delay(checkInterval);
    }
    
    console.warn(`ETA Exporter: Condition timeout after ${timeout}ms`);
    return false;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }
  
  async getInvoiceDetails(invoiceId) {
    try {
      const details = await this.extractInvoiceDetailsFromPageOptimized(invoiceId);
      return {
        success: true,
        data: details
      };
    } catch (error) {
      console.error('Error getting invoice details:', error);
      return { 
        success: false, 
        data: [],
        error: error.message 
      };
    }
  }
  
  async extractInvoiceDetailsFromPageOptimized(invoiceId) {
    const details = [];
    
    try {
      const detailsTable = document.querySelector('.ms-DetailsList, [data-automationid="DetailsList"], table');
      
      if (detailsTable) {
        const rows = detailsTable.querySelectorAll('.ms-DetailsRow[role="row"], tr');
        
        // Process rows in larger batches for speed
        const batchSize = 10;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = Array.from(rows).slice(i, i + batchSize);
          
          const batchPromises = batch.map(async (row, batchIndex) => {
            const cells = row.querySelectorAll('.ms-DetailsRow-cell, td');
            
            if (cells.length >= 6) {
              const item = {
                itemCode: this.extractCellText(cells[0]) || `ITEM-${i + batchIndex + 1}`,
                description: this.extractCellText(cells[1]) || 'صنف',
                unitCode: this.extractCellText(cells[2]) || 'EA',
                unitName: this.extractCellText(cells[3]) || 'قطعة',
                quantity: this.extractCellText(cells[4]) || '1',
                unitPrice: this.extractCellText(cells[5]) || '0',
                totalValue: this.extractCellText(cells[6]) || '0',
                taxAmount: this.extractCellText(cells[7]) || '0',
                vatAmount: this.extractCellText(cells[8]) || '0'
              };
              
              if (item.description && 
                  item.description !== 'اسم الصنف' && 
                  item.description !== 'Description' &&
                  item.description.trim() !== '') {
                return item;
              }
            }
            return null;
          });
          
          const batchResults = await Promise.all(batchPromises);
          const validItems = batchResults.filter(item => item !== null);
          details.push(...validItems);
        }
      }
      
      if (details.length === 0) {
        const invoice = this.invoiceData.find(inv => inv.electronicNumber === invoiceId);
        if (invoice) {
          details.push({
            itemCode: invoice.electronicNumber || 'INVOICE',
            description: 'إجمالي الفاتورة',
            unitCode: 'EA',
            unitName: 'فاتورة',
            quantity: '1',
            unitPrice: invoice.totalAmount || '0',
            totalValue: invoice.invoiceValue || invoice.totalAmount || '0',
            taxAmount: '0',
            vatAmount: invoice.vatAmount || '0'
          });
        }
      }
      
    } catch (error) {
      console.error('Error extracting invoice details:', error);
    }
    
    return details;
  }
  
  extractCellText(cell) {
    if (!cell) return '';
    
    const textElement = cell.querySelector('.griCellTitle, .griCellTitleGray, .ms-DetailsRow-cellContent') || cell;
    return textElement.textContent?.trim() || '';
  }
  
  getInvoiceData() {
    return {
      invoices: this.invoiceData,
      totalCount: this.totalCount,
      currentPage: this.currentPage,
      totalPages: this.totalPages
    };
  }
  
  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.rescanTimeout) {
      clearTimeout(this.rescanTimeout);
    }
    if (this.cachedNetworkData) {
      this.cachedNetworkData.clear();
    }
  }
}

// Initialize ultra-fast content script
const etaContentScript = new ETAContentScript();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('ETA Exporter: Received message:', request.action);
  
  switch (request.action) {
    case 'ping':
      sendResponse({ success: true, message: 'Ultra-fast content script is ready' });
      break;
      
    case 'getInvoiceData':
      const data = etaContentScript.getInvoiceData();
      console.log('ETA Exporter: Returning invoice data:', data);
      sendResponse({
        success: true,
        data: data
      });
      break;
      
    case 'getInvoiceDetails':
      etaContentScript.getInvoiceDetails(request.invoiceId)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'getAllPagesData':
      if (request.options && request.options.progressCallback) {
        etaContentScript.setProgressCallback((progress) => {
          chrome.runtime.sendMessage({
            action: 'progressUpdate',
            progress: progress
          }).catch(() => {
            // Ignore errors if popup is closed
          });
        });
      }
      
      etaContentScript.getAllPagesData(request.options)
        .then(result => {
          console.log('ETA Exporter: All pages data result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('ETA Exporter: Error in getAllPagesData:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    case 'rescanPage':
      etaContentScript.scanForInvoices();
      sendResponse({
        success: true,
        data: etaContentScript.getInvoiceData()
      });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  etaContentScript.cleanup();
});

console.log('ETA Exporter: Ultra-fast content script loaded successfully');