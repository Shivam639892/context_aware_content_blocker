document.getElementById("savePrefs").addEventListener("click", () => {
  const selected = [...document.querySelectorAll("input:checked")].map(i => i.value);
  chrome.storage.sync.set({ preferences: selected }, () => {
    alert("Preferences saved!");
  });
});
