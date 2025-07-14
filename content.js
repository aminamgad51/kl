// Enhanced Content Script for ETA Invoice Exporter
class ETAContentScript {
    constructor() {
        this.networkData = new Map();
        this.cacheTimeout = 15000; // 15 seconds cache
        this.isProcessing = false;
        this.currentPageData = null;
        this.totalInvoicesFound = 0;
        this.lastPageContent = '';
        this.stuckPageCount = 0;
        this.maxStuckPages = 3;
        
        this.init();
    }

    init() {
        this.setupNetworkInterception();
        this.setupMessageListener();
        console.log('ETA Content Script initialized with network interception');
    }

    setupNetworkInterception() {
        // Intercept XHR requests
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._url = url;
            this._method = method;
            return originalXHROpen.apply(this, [method, url, ...args]);
        };
        
        XMLHttpRequest.prototype.send = function(data) {
            this.addEventListener('load', () => {
                if (this._url && this._url.includes('invoicing.eta.gov.eg') && 
                    (this._url.includes('documents') || this._url.includes('search') || this._url.includes('list'))) {
                    try {
                        const responseData = JSON.parse(this.responseText);
                        window.etaContentScript.cacheNetworkResponse(this._url, responseData);
                    } catch (e) {
                        console.log('Non-JSON response:', this._url);
                    }
                }
            });
            return originalXHRSend.apply(this, [data]);
        };

        // Intercept Fetch requests
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            return originalFetch(url, options).then(response => {
                if (url.includes && url.includes('invoicing.eta.gov.eg') && 
                    (url.includes('documents') || url.includes('search') || url.includes('list'))) {
                    response.clone().json().then(data => {
                        window.etaContentScript.cacheNetworkResponse(url, data);
                    }).catch(() => {
                        console.log('Non-JSON fetch response:', url);
                    });
                }
                return response;
            });
        };

        // Make this instance globally accessible
        window.etaContentScript = this;
    }

    cacheNetworkResponse(url, data) {
        const cacheKey = this.generateCacheKey(url);
        this.networkData.set(cacheKey, {
            data: data,
            timestamp: Date.now(),
            url: url
        });
        
        // Clean old cache entries
        this.cleanCache();
        
        console.log('Cached network response:', cacheKey, data);
    }

    generateCacheKey(url) {
        // Extract page number and other relevant parameters
        const urlObj = new URL(url, window.location.origin);
        const page = urlObj.searchParams.get('page') || urlObj.searchParams.get('pageNumber') || '1';
        const size = urlObj.searchParams.get('size') || urlObj.searchParams.get('pageSize') || '10';
        return `page_${page}_size_${size}`;
    }

    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.networkData.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.networkData.delete(key);
            }
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'ping':
                    sendResponse({ success: true, message: 'Content script ready' });
                    break;

                case 'getInvoiceData':
                    const currentPageData = await this.getCurrentPageData();
                    sendResponse({ success: true, data: currentPageData });
                    break;

                case 'getAllPagesData':
                    if (this.isProcessing) {
                        sendResponse({ success: false, error: 'Already processing' });
                        return;
                    }
                    this.getAllPagesData(message.options, sendResponse);
                    break;

                case 'getInvoiceDetails':
                    const details = await this.getInvoiceDetails(message.invoiceId);
                    sendResponse({ success: true, data: details });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async getCurrentPageData() {
        console.log('Getting current page data...');
        
        // Try network data first
        const networkData = this.getLatestNetworkData();
        if (networkData) {
            console.log('Using network data');
            return this.processNetworkData(networkData);
        }
        
        // Fallback to DOM scraping
        console.log('Falling back to DOM scraping');
        return this.scrapeDOMData();
    }

    getLatestNetworkData() {
        let latestData = null;
        let latestTimestamp = 0;
        
        for (const [key, value] of this.networkData.entries()) {
            if (value.timestamp > latestTimestamp) {
                latestTimestamp = value.timestamp;
                latestData = value.data;
            }
        }
        
        return latestData;
    }

    processNetworkData(data) {
        console.log('Processing network data:', data);
        
        // Extract invoices from various possible data structures
        let invoices = [];
        let totalCount = 0;
        let currentPage = 1;
        let totalPages = 1;
        
        // Try different data structure patterns
        if (data.result && Array.isArray(data.result)) {
            invoices = data.result;
        } else if (data.data && Array.isArray(data.data)) {
            invoices = data.data;
        } else if (data.documents && Array.isArray(data.documents)) {
            invoices = data.documents;
        } else if (data.items && Array.isArray(data.items)) {
            invoices = data.items;
        } else if (Array.isArray(data)) {
            invoices = data;
        }
        
        // Extract pagination info
        if (data.totalElements) totalCount = data.totalElements;
        else if (data.totalCount) totalCount = data.totalCount;
        else if (data.total) totalCount = data.total;
        else if (data.count) totalCount = data.count;
        
        if (data.totalPages) totalPages = data.totalPages;
        else if (data.pageCount) totalPages = data.pageCount;
        else if (totalCount && data.size) totalPages = Math.ceil(totalCount / data.size);
        
        if (data.currentPage) currentPage = data.currentPage;
        else if (data.page) currentPage = data.page;
        else if (data.pageNumber) currentPage = data.pageNumber;
        
        // Transform network data to our format
        const transformedInvoices = invoices.map(invoice => this.transformNetworkInvoice(invoice));
        
        console.log(`Network data: ${transformedInvoices.length} invoices, page ${currentPage}/${totalPages}, total: ${totalCount}`);
        
        return {
            invoices: transformedInvoices,
            totalCount: totalCount || transformedInvoices.length,
            currentPage: currentPage,
            totalPages: totalPages,
            source: 'network'
        };
    }

    transformNetworkInvoice(invoice) {
        return {
            serialNumber: invoice.serialNumber || invoice.id || '',
            documentType: invoice.documentType || invoice.type || 'فاتورة',
            documentVersion: invoice.documentVersion || invoice.version || '1.0',
            status: invoice.status || invoice.state || '',
            issueDate: invoice.issueDate || invoice.dateTimeIssued || invoice.createdDate || '',
            submissionDate: invoice.submissionDate || invoice.dateTimeReceived || invoice.submittedDate || '',
            invoiceCurrency: invoice.invoiceCurrency || invoice.currency || 'EGP',
            invoiceValue: invoice.invoiceValue || invoice.netAmount || invoice.amount || '',
            vatAmount: invoice.vatAmount || invoice.taxAmount || invoice.vat || '',
            taxDiscount: invoice.taxDiscount || invoice.discount || '0',
            totalAmount: invoice.totalAmount || invoice.totalSalesAmount || invoice.total || '',
            internalNumber: invoice.internalNumber || invoice.internalId || invoice.referenceNumber || '',
            electronicNumber: invoice.electronicNumber || invoice.uuid || invoice.documentId || '',
            sellerTaxNumber: invoice.sellerTaxNumber || (invoice.seller && invoice.seller.taxNumber) || '',
            sellerName: invoice.sellerName || (invoice.seller && invoice.seller.name) || '',
            sellerAddress: invoice.sellerAddress || (invoice.seller && invoice.seller.address) || '',
            buyerTaxNumber: invoice.buyerTaxNumber || (invoice.buyer && invoice.buyer.taxNumber) || '',
            buyerName: invoice.buyerName || (invoice.buyer && invoice.buyer.name) || '',
            buyerAddress: invoice.buyerAddress || (invoice.buyer && invoice.buyer.address) || '',
            purchaseOrderRef: invoice.purchaseOrderRef || invoice.poReference || '',
            purchaseOrderDesc: invoice.purchaseOrderDesc || invoice.poDescription || '',
            salesOrderRef: invoice.salesOrderRef || invoice.soReference || '',
            electronicSignature: invoice.electronicSignature || 'موقع إلكترونياً',
            foodDrugGuide: invoice.foodDrugGuide || '',
            externalLink: invoice.externalLink || ''
        };
    }

    async scrapeDOMData() {
        console.log('Scraping DOM data...');
        
        // Wait for table to be ready
        await this.waitForInvoiceTable();
        
        const invoices = this.extractInvoicesFromDOM();
        const pagination = this.extractPaginationInfo();
        
        console.log(`DOM data: ${invoices.length} invoices, page ${pagination.currentPage}/${pagination.totalPages}, total: ${pagination.totalCount}`);
        
        return {
            invoices: invoices,
            totalCount: pagination.totalCount,
            currentPage: pagination.currentPage,
            totalPages: pagination.totalPages,
            source: 'dom'
        };
    }

    async waitForInvoiceTable(timeout = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const table = document.querySelector('table tbody tr, .invoice-row, [data-testid="invoice-row"], .document-row');
            if (table) {
                // Wait a bit more for content to stabilize
                await this.sleep(200);
                return table;
            }
            await this.sleep(100);
        }
        
        throw new Error('Invoice table not found within timeout');
    }

    extractInvoicesFromDOM() {
        const invoices = [];
        
        // Multiple selectors for invoice rows
        const rowSelectors = [
            'table tbody tr',
            '.invoice-row',
            '[data-testid="invoice-row"]',
            '.document-row',
            'tr[role="row"]'
        ];
        
        let rows = [];
        for (const selector of rowSelectors) {
            rows = document.querySelectorAll(selector);
            if (rows.length > 0) break;
        }
        
        console.log(`Found ${rows.length} invoice rows`);
        
        rows.forEach((row, index) => {
            try {
                const invoice = this.extractInvoiceFromRow(row, index);
                if (invoice && invoice.electronicNumber) {
                    invoices.push(invoice);
                }
            } catch (error) {
                console.warn(`Error extracting invoice from row ${index}:`, error);
            }
        });
        
        return invoices;
    }

    extractInvoiceFromRow(row, index) {
        const cells = row.querySelectorAll('td, .cell, [data-testid*="cell"]');
        
        if (cells.length === 0) return null;
        
        // Extract text from cells with multiple fallback methods
        const getCellText = (cellIndex) => {
            if (cellIndex >= cells.length) return '';
            const cell = cells[cellIndex];
            return cell.textContent?.trim() || cell.innerText?.trim() || '';
        };
        
        // Get electronic number (usually in first or second column)
        let electronicNumber = getCellText(0) || getCellText(1);
        
        // If electronic number looks like a button or action, try next cell
        if (electronicNumber.toLowerCase().includes('view') || 
            electronicNumber.toLowerCase().includes('عرض') ||
            electronicNumber.length < 5) {
            electronicNumber = getCellText(1) || getCellText(2);
        }
        
        return {
            serialNumber: (index + 1).toString(),
            documentType: getCellText(3) || getCellText(4) || 'فاتورة',
            documentVersion: getCellText(4) || getCellText(5) || '1.0',
            status: getCellText(5) || getCellText(6) || '',
            issueDate: getCellText(1) || getCellText(2) || '',
            submissionDate: getCellText(2) || getCellText(3) || '',
            invoiceCurrency: 'EGP',
            invoiceValue: getCellText(7) || getCellText(8) || '',
            vatAmount: getCellText(8) || getCellText(9) || '',
            taxDiscount: '0',
            totalAmount: getCellText(9) || getCellText(10) || getCellText(7) || '',
            internalNumber: getCellText(0) || getCellText(1) || '',
            electronicNumber: electronicNumber,
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
            externalLink: ''
        };
    }

    extractPaginationInfo() {
        let totalCount = 0;
        let currentPage = 1;
        let totalPages = 1;
        
        // Try to find total count from "Results: X" text
        const resultTexts = [
            document.querySelector('.results-count'),
            document.querySelector('[data-testid="results-count"]'),
            ...Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.includes('Results:') || 
                el.textContent && el.textContent.includes('نتيجة:') ||
                el.textContent && el.textContent.includes('النتائج:')
            )
        ];
        
        for (const element of resultTexts) {
            if (element && element.textContent) {
                const match = element.textContent.match(/(\d+)/);
                if (match) {
                    totalCount = parseInt(match[1]);
                    break;
                }
            }
        }
        
        // Try to find current page
        const pageElements = [
            document.querySelector('.current-page'),
            document.querySelector('[data-testid="current-page"]'),
            document.querySelector('.page-number.active'),
            ...Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.match(/صفحة\s*\d+/) ||
                el.textContent && el.textContent.match(/Page\s*\d+/)
            )
        ];
        
        for (const element of pageElements) {
            if (element && element.textContent) {
                const match = element.textContent.match(/(\d+)/);
                if (match) {
                    currentPage = parseInt(match[1]);
                    break;
                }
            }
        }
        
        // Calculate total pages (assuming 10 items per page as default)
        const itemsPerPage = 10;
        if (totalCount > 0) {
            totalPages = Math.ceil(totalCount / itemsPerPage);
        }
        
        // Limit total pages to reasonable number
        totalPages = Math.min(totalPages, 100);
        
        console.log(`Pagination: page ${currentPage}/${totalPages}, total: ${totalCount}`);
        
        return { totalCount, currentPage, totalPages };
    }

    async getAllPagesData(options, sendResponse) {
        this.isProcessing = true;
        const allInvoices = [];
        let currentPage = 1;
        let totalPages = 1;
        let totalCount = 0;
        let consecutiveEmptyPages = 0;
        let processedInvoices = 0;
        
        try {
            console.log('Starting to collect all pages data...');
            
            // Get initial page data to determine total pages
            const initialData = await this.getCurrentPageData();
            totalPages = Math.min(initialData.totalPages || 1, 100); // Limit to 100 pages max
            totalCount = initialData.totalCount || 0;
            currentPage = initialData.currentPage || 1;
            
            console.log(`Initial data: ${totalPages} total pages, ${totalCount} total invoices`);
            
            // Add initial page data
            allInvoices.push(...initialData.invoices);
            processedInvoices += initialData.invoices.length;
            
            // Send initial progress
            this.sendProgressUpdate(currentPage, totalPages, `جاري تحميل الصفحة ${currentPage} من ${totalPages}...`);
            
            // Process remaining pages
            while (currentPage < totalPages && consecutiveEmptyPages < 3 && processedInvoices < totalCount) {
                try {
                    console.log(`Processing page ${currentPage + 1}/${totalPages}`);
                    
                    // Navigate to next page
                    const navigated = await this.navigateToNextPage();
                    if (!navigated) {
                        console.log('Could not navigate to next page, stopping');
                        break;
                    }
                    
                    currentPage++;
                    
                    // Get page data
                    const pageData = await this.getCurrentPageData();
                    
                    if (pageData.invoices.length === 0) {
                        consecutiveEmptyPages++;
                        console.log(`Empty page ${currentPage}, consecutive empty: ${consecutiveEmptyPages}`);
                        
                        if (consecutiveEmptyPages >= 3) {
                            console.log('Too many consecutive empty pages, stopping');
                            break;
                        }
                        continue;
                    } else {
                        consecutiveEmptyPages = 0;
                    }
                    
                    // Check if we're stuck on the same content
                    const currentContent = JSON.stringify(pageData.invoices.slice(0, 3));
                    if (currentContent === this.lastPageContent) {
                        this.stuckPageCount++;
                        console.log(`Stuck on same content, count: ${this.stuckPageCount}`);
                        
                        if (this.stuckPageCount >= this.maxStuckPages) {
                            console.log('Stuck on same page content, stopping');
                            break;
                        }
                    } else {
                        this.stuckPageCount = 0;
                        this.lastPageContent = currentContent;
                    }
                    
                    // Add new invoices (avoid duplicates)
                    const newInvoices = pageData.invoices.filter(invoice => 
                        !allInvoices.some(existing => existing.electronicNumber === invoice.electronicNumber)
                    );
                    
                    allInvoices.push(...newInvoices);
                    processedInvoices += newInvoices.length;
                    
                    console.log(`Page ${currentPage}: ${newInvoices.length} new invoices, total: ${allInvoices.length}`);
                    
                    // Send progress update
                    this.sendProgressUpdate(currentPage, totalPages, `جاري تحميل الصفحة ${currentPage} من ${totalPages}...`);
                    
                    // Check if we have all invoices
                    if (processedInvoices >= totalCount && totalCount > 0) {
                        console.log('Collected all invoices, stopping');
                        break;
                    }
                    
                    // Small delay to prevent overwhelming the server
                    await this.sleep(100);
                    
                } catch (pageError) {
                    console.error(`Error processing page ${currentPage + 1}:`, pageError);
                    consecutiveEmptyPages++;
                    
                    if (consecutiveEmptyPages >= 3) {
                        console.log('Too many consecutive errors, stopping');
                        break;
                    }
                }
            }
            
            console.log(`Finished collecting data: ${allInvoices.length} total invoices from ${currentPage} pages`);
            
            sendResponse({
                success: true,
                data: allInvoices
            });
            
        } catch (error) {
            console.error('Error in getAllPagesData:', error);
            sendResponse({
                success: false,
                error: error.message,
                data: allInvoices // Return what we have so far
            });
        } finally {
            this.isProcessing = false;
        }
    }

    async navigateToNextPage() {
        console.log('Navigating to next page...');
        
        // Multiple strategies for finding next button
        const nextButtonSelectors = [
            'button[aria-label*="next"]',
            'button[title*="next"]',
            '.next-page',
            '.pagination-next',
            '[data-testid="next-page"]',
            'button:contains("Next")',
            'button:contains("التالي")',
            '.page-link[aria-label*="Next"]',
            '.pagination .page-item:last-child button',
            'button[disabled="false"]:contains(">")'
        ];
        
        let nextButton = null;
        
        for (const selector of nextButtonSelectors) {
            try {
                if (selector.includes(':contains')) {
                    // Handle :contains pseudo-selector manually
                    const buttons = document.querySelectorAll('button');
                    for (const button of buttons) {
                        const text = button.textContent.toLowerCase();
                        if ((selector.includes('Next') && text.includes('next')) ||
                            (selector.includes('التالي') && text.includes('التالي')) ||
                            (selector.includes('>') && text.includes('>'))) {
                            nextButton = button;
                            break;
                        }
                    }
                } else {
                    nextButton = document.querySelector(selector);
                }
                
                if (nextButton && !nextButton.disabled) {
                    break;
                }
            } catch (e) {
                console.warn(`Error with selector ${selector}:`, e);
            }
        }
        
        if (!nextButton || nextButton.disabled) {
            console.log('No enabled next button found');
            return false;
        }
        
        // Click the next button
        try {
            nextButton.click();
            console.log('Clicked next button');
            
            // Wait for page to load
            await this.waitForPageLoad();
            
            return true;
        } catch (error) {
            console.error('Error clicking next button:', error);
            return false;
        }
    }

    async waitForPageLoad() {
        console.log('Waiting for page to load...');
        
        // Wait for network activity to settle
        await this.sleep(300);
        
        // Wait for table to be ready
        try {
            await this.waitForInvoiceTable(3000);
            console.log('Page loaded successfully');
        } catch (error) {
            console.warn('Page load timeout, continuing anyway');
        }
        
        // Additional small delay for content to stabilize
        await this.sleep(200);
    }

    sendProgressUpdate(currentPage, totalPages, message) {
        const percentage = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
        
        try {
            chrome.runtime.sendMessage({
                action: 'progressUpdate',
                progress: {
                    currentPage: currentPage,
                    totalPages: totalPages,
                    percentage: percentage,
                    message: message
                }
            });
        } catch (error) {
            console.warn('Could not send progress update:', error);
        }
    }

    async getInvoiceDetails(invoiceId) {
        console.log(`Getting details for invoice: ${invoiceId}`);
        
        // Try to find and click the details button for this invoice
        const detailButtons = document.querySelectorAll('button, a, .view-button, [data-testid*="view"], [data-testid*="details"]');
        
        for (const button of detailButtons) {
            const buttonText = button.textContent.toLowerCase();
            const buttonHref = button.href || '';
            
            if (buttonText.includes('view') || buttonText.includes('عرض') || 
                buttonText.includes('details') || buttonText.includes('تفاصيل') ||
                buttonHref.includes(invoiceId)) {
                
                try {
                    // This is a simplified implementation
                    // In a real scenario, you might need to navigate to a details page
                    // and scrape the detailed information
                    
                    return [{
                        itemCode: invoiceId,
                        description: 'إجمالي قيمة الفاتورة',
                        unitCode: 'EA',
                        unitName: 'فاتورة',
                        quantity: '1',
                        unitPrice: '0',
                        totalValue: '0',
                        taxAmount: '0',
                        vatAmount: '0',
                        totalWithVat: '0'
                    }];
                } catch (error) {
                    console.error('Error getting invoice details:', error);
                }
                break;
            }
        }
        
        // Return empty details if not found
        return [];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the content script
new ETAContentScript();