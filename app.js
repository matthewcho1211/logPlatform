const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const app = express();
const moment = require("moment");
const request = require("request");
require("dotenv").config();
const { Client } = require("@elastic/elasticsearch");
const { WebServiceClient } = require("@maxmind/geoip2-node");

const userId = "937805";
const licenseKey = "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";
const serviceClient = new WebServiceClient(userId, licenseKey, {
  host: "geolite.info",
});

app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: "mySecretKey",
    resave: true,
    saveUninitialized: true,
  })
);

// 黑名單讀進來
const fs = require("fs");
const path = require("path");

const immortalDomainsPath = path.join(__dirname, "ip_immortal_domains.txt");
let immortalIPs;
let logs;

try {
  const data = fs.readFileSync(immortalDomainsPath, "utf8");
  immortalIPs = data.split("\n").map((ip) => ip.replace(/\r$/, ""));
  //console.log(immortalIPs);
} catch (err) {
  console.error("無法讀取文件:", err);
  immortalIPs = [];
}

const client = new Client({ node: "http://localhost:9200" }); //連自己的測試
// const client = new Client({
//   node: "http://192.168.0.101:9200", // Elasticsearch虛擬機的IP和端口
//   auth: {
//     username: "elastic", // Elasticsearch用戶名
//     password: "R193XUF00LXgVlvVJmhx", // Elasticsearch密碼
//   },
// });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const authenticate = (req, res, next) => {
  if (req.session.isAuthenticated) {
    next();
  } else {
    res.render("login");
  }
};

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const presetUsername = process.env.USER;
  const presetPassword = process.env.PASSWORD;

  if (username === presetUsername && password === presetPassword) {
    req.session.isAuthenticated = true;
    res.redirect("/");
  } else {
    res.redirect("/login?error=用戶名或密碼錯誤。");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(function (err) {
    res.redirect("/login");
  });
});
app.get("/searchLogs", async (req, res) => {
  try {
    const { startDate, endDate, host, eventId, logLevel } = req.query;

    if (!startDate || !endDate || !host) {
      return res.render("search", {
        error: "StartDate, endDate, host, are all required.",
      });
    }

    const queryBody = {
      query: {
        bool: {
          must: [
            {
              range: {
                "@timestamp": {
                  gte: startDate,
                  lte: endDate,
                },
              },
            },
            {
              term: {
                "host.hostname": host,
              },
            },
          ],
        },
      },
    };

    if (eventId) {
      // 如果存在 eventId，就加入查詢條件中
      queryBody.query.bool.must.push({
        term: {
          "winlog.event_id": eventId,
        },
      });
    }

    if (logLevel) {
      queryBody.query.bool.must.push({
        term: {
          "log.level": logLevel,
        },
      });
    }
    const result = await client.search({
      index: "winlogbeat-*",
      size: 1000,
      body: queryBody,
    });

    const logs = result.hits.hits;
    //console.log(logs[0]);

    res.render("search", { logs: logs, error: null });
  } catch (error) {
    console.error("Elasticsearch查詢錯誤:", error);
    res.render("search", { logs: [], error: "No matching logs found." });
  }
});

app.get("/logDetail/:logId", async (req, res) => {
  try {
    const logId = req.params.logId;

    const result = await client.search({
      index: "winlogbeat-*",
      body: {
        query: {
          term: {
            _id: logId,
          },
        },
      },
    });

    const log = result.hits.hits;
    //console.log(log);
    res.render("logInfo", { log: log });
  } catch (error) {
    console.error("Elasticsearch 查詢錯誤:", error);
    res.status(500).json({ error: "Elasticsearch 查詢錯誤" });
  }
});

//圖表標準化的模式
async function searchLogs(startDate, endDate, timeRange) {
  let currentIndexDate = new Date(startDate);
  const endIndexDate = new Date(endDate);
  let fixed_interval;
  let format;
  if (timeRange == "hour") {
    format = "dd-HH";
  } else if (timeRange == "day") {
    format = "MM-dd";
  } else if (timeRange == "week") {
    format = "yyyy-ww";
  } else if (timeRange == "month") {
    format = "MM";
  }
  let indices = [];

  while (currentIndexDate <= endIndexDate) {
    const year = currentIndexDate.getFullYear();
    const month = String(currentIndexDate.getMonth() + 1).padStart(2, "0");
    const indexName = `winlogbeat-${year}.${month}`;
    if (!indices.includes(indexName)) {
      indices.push(indexName);
    }
    currentIndexDate.setMonth(currentIndexDate.getMonth() + 1);
  }

  // 執行 Elasticsearch 查詢
  const response = await client.search({
    index: indices,
    body: {
      query: {
        range: {
          "@timestamp": {
            gte: startDate,
            lte: endDate,
            time_zone: "+08:00",
          },
        },
      },
      aggs: {
        logs_over_time: {
          date_histogram: {
            field: "@timestamp",
            calendar_interval: timeRange,
            format: format,
            time_zone: "+08:00",
            min_doc_count: 0,
          },
        },
      },
      size: 0,
    },
  });
  const barchartdata = response.aggregations.logs_over_time.buckets;
  //console.log(barchartdata);
  return barchartdata;
}

app.get("/", async (req, res) => {
  //獲取前五多的event_id
  try {
    const result = await client.search({
      index: "winlogbeat-*",
      size: 0,
      body: {
        aggs: {
          top_event_ids: {
            terms: {
              field: "winlog.event_id",
              size: 5,
              order: { _count: "desc" },
            },
          },
        },
      },
    });

    const topEventIds = result.aggregations.top_event_ids.buckets.map(
      (bucket) => ({
        eventId: bucket.key,
        count: bucket.doc_count,
      })
    );

    res.locals.topEventIds = topEventIds;
  } catch (error) {
    console.error("Elasticsearch 查询错误:", error);
    res.status(500).json({ error: "Elasticsearch 查询错误" });
  }

  try {
    const result = await client.search({
      index: "winlogbeat-*",
      size: 0,
      body: {
        aggs: {
          event_ids: {
            terms: {
              field: "winlog.event_id",
              size: 1000,
            },
          },
        },
      },
    });

    const eventid_bucket = result.aggregations.event_ids.buckets;
    //console.log(eventid_bucket);
    const eventid_label = [];
    const eventid_count = [];

    eventid_bucket.forEach((item) => {
      eventid_label.push(item.key);
      eventid_count.push(item.doc_count);
    });
    res.locals.eventid_label = eventid_label;
    res.locals.eventid_count = eventid_count;
    //console.log(eventid_label);
    // console.log(eventid_count);
  } catch (error) {
    console.log("找不到event id");
  }

  // 查詢log.level
  try {
    const result = await client.search({
      index: "winlogbeat-*",
      size: 0,
      body: {
        aggs: {
          top_level_ids: {
            terms: {
              field: "log.level",
              size: 5,
              order: { _count: "desc" },
            },
          },
        },
      },
    });

    const toplevels = result.aggregations.top_level_ids.buckets.map(
      (bucket) => ({
        level: bucket.key,
        count: bucket.doc_count,
      })
    );

    res.locals.toplevels = toplevels;
  } catch (error) {
    console.error("Elasticsearch 查询错误:", error);
    res.status(500).json({ error: "Elasticsearch 查询错误" });
  }

  // ip來源國家
  try {
    //小酌測試這裡
    const aggs = {
      result: {
        terms: {
          field: "winlog.event_data.DestinationIp",
          order: [{ _count: "desc" }],
        },
      },
    };

    const result = await client.search({
      index: "winlogbeat-2023.11",
      size: 0,
      aggs: aggs,
    });

    //有資料再用下面這一行
    const data = result.aggregations.result.buckets;

    // 測試用假資料 Poker用這個
    //const data = [{ key: "35.215.173.207", doc_count: 1 }];

    const countryData = await Promise.all(
      data.map(async (bucket) => {
        const ip = bucket.key;
        const count = bucket.doc_count;

        try {
          // 獲取城市信息
          const ip_data = await serviceClient.city(ip);
          console.log(ip_data);

          // 提取國家和城市信息
          let latitude, longitude;
          let country = ip_data.country || ip_data.registeredCountry;
          if (country && country.isoCode) {
            country = country.isoCode;
            latitude = ip_data.location.latitude;
            longitude = ip_data.location.longitude;
          }
          //console.log(country);

          return { ip, country, latitude, longitude, count };
        } catch (error) {
          console.error("讀取 GeoIP 數據時發生錯誤:", error);
          // 適當地處理錯誤，例如返回默認值或將數據標記為無效。
          return {
            ip,
            country: "Unknown",
            latitude: "Unknown",
            longitude: "Unknown",
            count,
          };
        }
      })
    );

    //console.log(data);
    console.log(countryData);
    // const topIps = data.map((bucket) => ({
    //   ip: bucket.key,
    //   count: bucket.doc_count,
    // }));
    // console.log(topIps);
    res.locals.topIps = countryData;
  } catch (error) {
    console.error("Elasticsearch 查詢錯誤:", error);
  }

  try {
    const currentDate = new Date();
    const timeRange = req.query.timeRange || "hour";
    const startDate =
      req.query.startDate || currentDate.toISOString().split("T")[0];
    const endDate =
      req.query.endDate || currentDate.toISOString().split("T")[0];
    console.log(startDate, endDate);

    const result = await searchLogs(startDate, endDate, timeRange);

    const barlabel = [];
    const bardata = [];
    result.forEach((item) => {
      barlabel.push(item.key_as_string);
      bardata.push(item.doc_count);
    });
    //console.log(barlabel,bardata)

    res.locals.barlabel = barlabel;
    res.locals.bardata = bardata;
  } catch (error) {}

  try {
    const result = await client.search({
      index: "winlogbeat-*",
      size: 1000,
      body: {
        query: {
          bool: {
            must: [
              {
                range: {
                  "@timestamp": {
                    gte: "now-7d/d",
                    lte: "now/d",
                  },
                },
              },
              {
                terms: {
                  "winlog.event_data.DestinationIp": immortalIPs,
                },
              },
            ],
          },
        },
      },
    });
    let logs;
    let logsnullornot;
    logs = result.hits.hits;
    if (logs.length === 0) {
      logsnullornot = true;
    } else {
      logsnullornot = false;
    }
    const logslength = logs.length;
    console.log(logsnullornot);
    res.locals.logsnullornot = logsnullornot;
    res.locals.logslength = logslength;
  } catch (error) {}

  res.render("dashboard");
});

// async function getCountryCityFromIp(ip) {
//   return new Promise((resolve, reject) => {
//     // 使用 IP 地址轉換 API，這裡使用了一個示例的 API（ipinfo.io）
//     const apiUrl = `http://ipinfo.io/${ip}/json`;

//     request(apiUrl, (error, response, body) => {
//       if (!error && response.statusCode === 200) {
//         const data = JSON.parse(body);
//         const country = data.country;
//         const city = data.city;
//         resolve({ country, city });
//       } else {
//         reject(error || "Failed to retrieve country and city data");
//       }
//     });
//   });
// }

app.get("/search", (req, res) => {
  res.render("search", { logs: [], error: null });
});

app.get("/strangelog", async (req, res) => {
  try {
    const { startDate, endDate, host, eventId, logLevel } = req.query;

    if (!startDate || !endDate || !host) {
      return res.render("strangelog", {
        error: "StartDate, endDate, host, are all required.",
      });
    }

    const queryBody = {
      query: {
        bool: {
          must: [
            {
              range: {
                "@timestamp": {
                  gte: startDate,
                  lte: endDate,
                },
              },
            },
            {
              term: {
                "host.hostname": host,
              },
            },
            {
              terms: {
                "winlog.event_data.DestinationIp": immortalIPs,
              },
            },
          ],
        },
      },
    };

    if (eventId) {
      // 如果存在 eventId，就加入查詢條件中
      queryBody.query.bool.must.push({
        term: {
          "winlog.event_id": eventId,
        },
      });
    }

    if (logLevel) {
      queryBody.query.bool.must.push({
        term: {
          "log.level": logLevel,
        },
      });
    }
    const result = await client.search({
      index: "winlogbeat-*",
      size: 1000,
      body: queryBody,
    });

    logs = result.hits.hits;
    console.log(logs);

    res.render("strangelog", { logs: logs, error: null });
  } catch (error) {
    console.error("Elasticsearch查詢錯誤:", error);
    res.render("strangelog", { logs: [], error: "No matching logs found." });
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
