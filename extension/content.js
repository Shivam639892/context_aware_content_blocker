(async function() {
  console.log("YouTube Homepage Filter - Content script started");

  // Queue to manage video processing with delays
  let processingQueue = [];
  let isProcessing = false;
  const DELAY_BETWEEN_REQUESTS = 5000; // 5 seconds

  // Wait for homepage to load
  await waitForElement('ytd-rich-grid-renderer, ytd-browse[page-subtype="home"]');
  console.log("YouTube homepage detected");

  // Process all video thumbnails on homepage
  processHomePageVideos();

  // Watch for dynamically loaded videos (infinite scroll)
  observeNewVideos();

  function processHomePageVideos() {
    // Select all video renderers on homepage
    const videoElements = document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer');
    
    console.log(`Found ${videoElements.length} videos on homepage`);

    videoElements.forEach((videoEl) => {
      // Skip if already processed or queued
      if (videoEl.dataset.processed || videoEl.dataset.queued) return;
      videoEl.dataset.queued = "true";

      const videoData = extractVideoData(videoEl);
      
      if (videoData.title) {
        // Add to processing queue instead of processing immediately
        processingQueue.push({ element: videoEl, data: videoData });
      }
    });

    // Start processing queue if not already processing
    if (!isProcessing) {
      processQueue();
    }
  }

  async function processQueue() {
    if (processingQueue.length === 0) {
      isProcessing = false;
      console.log("Queue empty, waiting for new videos...");
      return;
    }

    isProcessing = true;
    const { element: videoEl, data: videoData } = processingQueue.shift();

    // Mark as processed
    videoEl.dataset.processed = "true";
    delete videoEl.dataset.queued;

    console.log(`Processing video (${processingQueue.length} remaining in queue):`, videoData.title);

    try {
      // Send to background for classification
      chrome.runtime.sendMessage({ 
        type: "classifyVideo", 
        data: videoData 
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error("Message error:", chrome.runtime.lastError);
          return;
        }

        if (!response.error) {
          chrome.storage.sync.get("preferences", (result) => {
            const prefs = result.preferences || [];
            
            if (!prefs.includes(response.category)) {
              console.log(`Blocking video: ${videoData.title} (${response.category})`);
              blockVideoThumbnail(videoEl, response.category);
            } else {
              console.log(`Video allowed: ${videoData.title} (${response.category})`);
            }
          });
        } else {
          console.error("Classification error:", response.error);
        }
      });
    } catch (error) {
      console.error("Error processing video:", error);
    }

    // Wait 5 seconds before processing next video
    console.log(`Waiting ${DELAY_BETWEEN_REQUESTS/1000} seconds before next request...`);
    setTimeout(() => {
      processQueue();
    }, DELAY_BETWEEN_REQUESTS);
  }

  function extractVideoData(videoElement) {
    // Try multiple selectors for different YouTube layouts
    const titleEl = videoElement.querySelector('#video-title, h3 a, .title-and-badge a');
    const channelEl = videoElement.querySelector('#channel-name a, #text.ytd-channel-name a, ytd-channel-name a');
    
    // Description is rarely available on homepage thumbnails, but try metadata
    const metadataEl = videoElement.querySelector('#metadata-line, ytd-video-meta-block');
    
    return {
      title: titleEl ? (titleEl.getAttribute('aria-label') || titleEl.textContent.trim()) : "",
      channel: channelEl ? channelEl.textContent.trim() : "",
      description: metadataEl ? metadataEl.textContent.trim() : "",
      // You could also extract video URL for more info
      url: titleEl ? titleEl.href : ""
    };
  }

  function blockVideoThumbnail(videoElement, category) {
    // Create overlay for the specific video thumbnail
    const overlay = document.createElement("div");
    overlay.className = "yt-content-blocker-overlay";
    overlay.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 40px; margin-bottom: 10px;">🚫</div>
        <div style="font-weight: bold; margin-bottom: 5px;">Content Blocked</div>
        <div style="font-size: 12px; opacity: 0.8;">${category}</div>
      </div>
    `;
    
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.92);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      border-radius: 12px;
    `;

    // Make the video element container position relative
    videoElement.style.position = "relative";
    
    // Blur the thumbnail underneath
    const thumbnail = videoElement.querySelector('img, ytd-thumbnail');
    if (thumbnail) {
      thumbnail.style.filter = "blur(20px)";
    }

    videoElement.appendChild(overlay);
    
    // Prevent click events on blocked videos
    videoElement.style.pointerEvents = "none";
  }

  function observeNewVideos() {
    const observer = new MutationObserver((mutations) => {
      // Check if new video elements were added
      const hasNewVideos = mutations.some(mutation => 
        Array.from(mutation.addedNodes).some(node => 
          node.nodeType === 1 && (
            node.matches && node.matches('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer')
          )
        )
      );

      if (hasNewVideos) {
        console.log("New videos loaded, adding to queue...");
        processHomePageVideos();
      }
    });

    // Observe the main content area for new videos
    const contentArea = document.querySelector('ytd-rich-grid-renderer, #contents');
    if (contentArea) {
      observer.observe(contentArea, { childList: true, subtree: true });
      console.log("Started observing for new videos");
    }
  }

  function waitForElement(selector) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) {
        return resolve(el);
      }

      const observer = new MutationObserver(() => {
        const el2 = document.querySelector(selector);
        if (el2) {
          observer.disconnect();
          resolve(el2);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
})();
