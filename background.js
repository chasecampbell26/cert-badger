'use strict';

const expiringCertsByTab = new Map(); // tabId -> (sha256 -> {cert, req})

const FALLBACK_DEFAULT_WARN_THRESHOLD = 1;
const STORAGE_WARN_THRESHOLDS = "warnThresholdsV1";
const STORAGE_DEFAULT_WARN_THRESHOLD = "defaultWarnThresholdV1";

browser.runtime.onInstalled.addListener(details => {
  loadDefaultWarnThreshold()
    .then(defaultThreshold => {
      if (defaultThreshold == null) {
        return saveDefaultWarnThreshold(FALLBACK_DEFAULT_WARN_THRESHOLD);
      }
    })
    .catch(console.error);
});

browser.browserAction.setBadgeBackgroundColor({
  color: "yellow"
});

browser.webRequest.onHeadersReceived.addListener(
  headersReceivedListener,
  {urls: ["https://*/*"]}, // TODO no wss support here. alternatives?
  ["blocking"]
);

function headersReceivedListener(details) {
  if (details.fromCache !== false) return;
  // TODO rewrite with async/await
  const hostname = new URL(details.url).hostname;
  Promise.all([
    getWarnThreshold(hostname),
    browser.webRequest.getSecurityInfo(details.requestId, {certificateChain: true})
  ]).then(([warnThreshold, securityInfo]) => {
    const expiringCerts = securityInfo.certificates.filter(
      cert => !certValidAfterDays(cert, warnThreshold)
    );
    if (expiringCerts.length > 0) {
      const tabId = details.tabId;
      const loggedCurrentTabCerts = expiringCertsForTabId(tabId);
      expiringCerts.forEach(cert =>
        loggedCurrentTabCerts.set(
          cert.fingerprint.sha256,
          {
            issuer: cert.issuer,
            subject: cert.subject,
            validityEnd: cert.validity.end,
            lastUrl: details.url,
            lastSeenTime: details.timeStamp,
            cert: cert
          }
        )
      );
      // TODO (maybe not here) clear loggedCurrentTabCerts when tab changes
      // page, delete when closes

      if (tabId >= 0) {
        browser.browserAction.setBadgeText({
          text: String(loggedCurrentTabCerts.size),
          tabId: tabId
        });
      } else {
        // TODO non-tab, e.g. service worker, other addon, etc.
      }
    }
  }).catch(console.error);
}

function getWarnThreshold(hostname) {
  return loadWarnThreshold(hostname)
    .then(threshold => {
      if (threshold == null) {
        return loadDefaultWarnThreshold()
          .then(defaultThreshold => {
            if (defaultThreshold == null) {
              return FALLBACK_DEFAULT_WARN_THRESHOLD;
            }
            return defaultThreshold;
          });
      }
      return threshold;
    });
}

function loadWarnThreshold(hostname) {
  return loadAllWarnThresholds()
    .then(thresholds => {
      if (thresholds == null) {
        return null;
      }
      return thresholds[hostname];
    });
}

// returns Promise that resolves to default threshold. unset=undefined
function loadDefaultWarnThreshold() {
  return browser.storage.local.get(STORAGE_DEFAULT_WARN_THRESHOLD)
    .then(result => result[STORAGE_DEFAULT_WARN_THRESHOLD]);
}

function saveDefaultWarnThreshold(value) {
  const intValue = parseInt(value, 10);
  if (Number.isNaN(intValue) || intValue < 1)
    throw new RangeError("value must be greater than or equal to 1");
  const objToSave = {};
  objToSave[STORAGE_DEFAULT_WARN_THRESHOLD] = intValue;
  return browser.storage.local.set(objToSave);
}

// V1: hostname -> time in days
// exact hostname match only
// FIXME change to 1 key per domain since .set doesn't work with object
function loadAllWarnThresholds() {
  return browser.storage.local.get(STORAGE_WARN_THRESHOLDS)
    .then(result => result[STORAGE_WARN_THRESHOLDS]);
}

function saveWarnThreshold(domain, days) {
  const intDays = parseInt(days, 10);
  if (Number.isNaN(intDays) || intDays < 1)
    throw new RangeError("days must be greater than or equal to 1");
  return loadAllWarnThresholds()
    .then(thresholds => {
      const newThresholds = (thresholds == null) ? {} : thresholds;
      newThresholds[domain] = intDays;
      const objToSave = {};
      objToSave[STORAGE_WARN_THRESHOLDS] = newThresholds;
      return browser.storage.local.set(objToSave);
    });
}

function deleteWarnThreshold(domain) {
  return loadAllWarnThresholds()
    .then(thresholds => {
      if (thresholds == null) return;
      delete thresholds[domain];
      const objToSave = {};
      objToSave[STORAGE_WARN_THRESHOLDS] = thresholds;
      return browser.storage.local.set(objToSave);
    });
}

function certValidAfterDays(cert, minValidDays) {
  // prepare futurePoint with minValidDays days into the future
  const futurePoint = new Date();
  futurePoint.setDate(futurePoint.getDate() + minValidDays);
  return futurePoint.getTime() <= cert.validity.end;
}

// Returns sha256 -> {cert, req}
function expiringCertsForTabId(tabId) {
  return expiringCertsByTab.get(tabId)
    || expiringCertsByTab.set(tabId, new Map()).get(tabId);
}
