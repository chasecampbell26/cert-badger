'use strict';

const defaultThresholdInput = document.getElementById("default_threshold");
const domainTable = document.getElementById("domain_table");

const bgPagePromise = browser.runtime.getBackgroundPage();

bgPagePromise
  .then(bgPage => bgPage.loadDefaultWarnThreshold())
  .then(defaultThreshold => {
    if (defaultThreshold == null) {
      defaultThresholdInput.parentNode.appendChild(
        document.createTextNode("Error: no default threshold set")
      );
      console.error("Error: no default threshold set");
      return;
    }
    defaultThresholdInput.value = defaultThreshold;
  })
  .catch(console.error);

defaultThresholdInput.addEventListener("input", e => {
  bgPagePromise
    .then(bgPage => {
      return bgPage.saveDefaultWarnThreshold(e.target.value);
    })
    .catch(console.error);
});

redrawDomainTable();

function redrawDomainTable() {
  // clear table, redraw header
  domainTable.innerHTML = `
    <tr>
      <th/>
      <th>Domain</th>
      <th>Show if expiring in days</th>
    </tr>
  `;

  bgPagePromise
    .then(bgPage => Promise.all([
      bgPage.loadAllWarnThresholds(),
      bgPagePromise
    ]))
    .then(([thresholds, bgPage]) => {
      // draw domain rows
      for (const domain in thresholds) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td><button>x</button></td>
          <td></td>
          <td>
            <input type="number" min="1">
          </td>
        `;
        const deleteButton = row.getElementsByTagName("button")[0];
        deleteButton.onclick = () => {
          bgPage.deleteWarnThreshold(domain)
            .then(redrawDomainTable)
            .catch(console.error);
        };
        const domainCell = row.getElementsByTagName("td")[1];
        domainCell.appendChild(document.createTextNode(domain));
        const thresholdBox = row.getElementsByTagName("input")[0];
        thresholdBox.value = thresholds[domain];
        thresholdBox.addEventListener("input", e => {
          bgPage.saveWarnThreshold(domain, e.target.value)
            .catch(console.error);
        });
        domainTable.appendChild(row);
      }
      const addDomainRow = document.createElement("tr");
      addDomainRow.innerHTML = `
        <td/>
        <td><button id="add_domain">Add</button></td>
        <td/>
      `;
      domainTable.appendChild(addDomainRow);
      const addDomainButton = document.getElementById("add_domain");
      addDomainButton.onclick = addDomain;
    })
    .catch(console.error);
}

function addDomain() {
  const domain = prompt("Enter the domain:");
  if (domain == null) return;
  bgPagePromise
    .then(bgPage => Promise.all([
      bgPage.loadWarnThreshold(domain),
      bgPage.loadDefaultWarnThreshold(),
      bgPagePromise
    ]))
    .then(([domainThreshold, defaultThreshold, bgPage]) => {
      if (domainThreshold != null) {
        alert(domain + " is already customized.")
        return;
      }
      return bgPage.saveWarnThreshold(domain, defaultThreshold);
    })
    .then(redrawDomainTable)
    .catch(console.error);
}
