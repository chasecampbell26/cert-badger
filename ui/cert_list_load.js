'use strict';

Promise.all([
  browser.runtime.getBackgroundPage(),
  browser.tabs.query({active: true, currentWindow: true})
    .then(tabs => {
      if (tabs.length > 1) {
        console.error(tabs);
        throw new Error("tabs.length=" + tabs.length + " is greater than 1");
      }
      // if tabs is null, undef, or empty we will error out anyway
      return tabs[0].id;
    })
]).then(([bgPage, tabId]) => {
  const table = document.getElementById("cert_table");
  for (const [sha256, certInfo] of bgPage.expiringCertsForTabId(tabId)) {
    const rowNode = document.createElement("tr");
    addTdWithText(certInfo.issuer, rowNode);
    addTdWithText(certInfo.subject, rowNode);
    addTdWithText(new Date(certInfo.validityEnd).toLocaleString(), rowNode);
    addTdWithText(certInfo.lastUrl, rowNode);
    addTdWithText(new Date(certInfo.lastSeenTime).toLocaleString(), rowNode);
    table.appendChild(rowNode);
  }
}).catch(console.error);

function addTdWithText(text, rowNode) {
  const tdNode = document.createElement("td");
  const textNode = document.createTextNode(text);
  tdNode.appendChild(textNode);
  rowNode.appendChild(tdNode);
}
