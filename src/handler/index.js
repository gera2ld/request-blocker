import { List } from './list';
import { getActiveTab, ObjectStorage } from './util';

const logs = {};
const MAX_RECORD_NUM = 200;
const global = new ObjectStorage('global');
const config = new ObjectStorage('config');

function pushLog(details, result) {
  const { tabId, url } = details;
  let log = logs[tabId];
  if (!log) {
    log = {
      count: {
        page: 0,
        tab: 0,
      },
      records: [],
    };
    logs[tabId] = log;
  }
  log.count.page += 1;
  log.count.tab += 1;
  global.set(data => {
    data.count = (data.count || 0) + 1;
  });
  log.records.push({
    url,
    result,
  });
  while (log.records.length > MAX_RECORD_NUM) {
    log.records.shift(); // shift is faster than splice
  }
  updateBadge(tabId);
}

function updateBadge(tabId) {
  const log = logs[tabId];
  browser.browserAction.setBadgeBackgroundColor({
    color: '#808',
    tabId,
  });
  const configBadge = config.get('badge');
  let count;
  if (configBadge === 'page') {
    count = log?.count?.page;
  } else if (configBadge === 'tab') {
    count = log?.count?.tab;
  } else if (configBadge === 'total') {
    count = global.get('count');
  }
  count = `${count || ''}`;
  browser.browserAction.setBadgeText({
    text: count,
    tabId,
  });
}

browser.webRequest.onBeforeRequest.addListener((details) => {
  const target = List.match(details);
  if (target) {
    console.info(`matched: ${details.method} ${details.url}`, target);
    pushLog(details, target);
    return target;
  }
}, {
  urls: ['<all_urls>'],
}, ['blocking']);

browser.tabs.onRemoved.addListener((tabId) => {
  delete logs[tabId];
});
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    const count = logs[tabId]?.count;
    if (count) count.page = 0;
    updateBadge(tabId);
  }
});
browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  logs[addedTabId] = logs[removedTabId];
  delete logs[removedTabId];
});

const commands = {
  GetLists: () => List.get(),
  GetList: id => List.find(id).get(),
  RemoveList: id => List.remove(id),
  UpdateList: async data => {
    let list;
    if (data.id) {
      list = List.find(data.id);
      await list.update(data);
    } else {
      list = await List.create(data);
    }
    return list.id;
  },
  FetchLists: () => List.fetch(),
  FetchList: id => List.find(id).fetch(),
  async GetCount() {
    const tab = await getActiveTab();
    return {
      ...logs[tab.id]?.count,
      global: global.get('count'),
    };
  },
  async GetConfig() {
    await config.loading;
    return config.get();
  },
  async SetConfig({ key, value }) {
    await config.loading;
    config.set({
      [key]: value,
    });
  },
  async ResetCount() {
    return global.set({
      count: 0,
    });
  },
};
browser.runtime.onMessage.addListener((req, src) => {
  const func = commands[req.cmd];
  if (!func) return;
  return func(req.data, src);
});

List.load();

browser.alarms.create({
  delayInMinutes: 1,
  periodInMinutes: 120,
});
browser.alarms.onAlarm.addListener(() => {
  console.info(new Date().toISOString(), 'Fetching lists...');
  List.fetch();
});
