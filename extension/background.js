console.log("Background script started");

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  if (message.type === "classifyVideo") {
    const videoData = message.data;
    
    console.log("Sending video data to backend:", videoData);

    // Call Flask backend API
    fetch("https://5000-shivam63982-contextawar-fdwryohesyt.ws-us121.gitpod.io/classify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: videoData.title || "",
        description: videoData.description || "",
        channel: videoData.channel || "",
        url: videoData.url || ""
      })
    })
      .then(response => {
        console.log("Response status:", response.status);
        return response.json();
      })
      .then(data => {
        console.log("Received classification result:", data);
        
        // Always send response back to content script
        if (data.error) {
          console.error("Classification error:", data.error);
          sendResponse({
            category: data.category || "Entertainment",
            confidence: data.confidence || 0.5,
            error: data.error
          });
        } else {
          sendResponse({
            category: data.category || "Entertainment",
            confidence: data.confidence || 0.8
          });
        }
      })
      .catch(error => {
        console.error("Fetch error:", error);
        // Send fallback response even on error
        sendResponse({
          category: "Entertainment",
          confidence: 0.5,
          error: error.message
        });
      });

    // Return true to indicate async response
    return true;
  }
});

console.log("Background script ready, listening for messages...");
