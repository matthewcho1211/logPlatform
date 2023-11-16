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

const client = new Client({ node: "http://localhost:9200" }); //連自己的測試
// const client = new Client({
//   node: "http://192.168.0.103:9200", // Elasticsearch虛擬機的IP和端口
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
    res.send("用戶名或密碼錯誤。");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(function (err) {
    res.redirect("/login");
  });
});
app.get("/searchLogs", async (req, res) => {
  try {
    const { startDate, endDate, host, index, eventId } = req.query;

    if (!startDate || !endDate || !host || !index) {
      return res.render("search", {
        error: "StartDate, endDate, host, and index are all required.",
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

    const result = await client.search({
      index: index,
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
      index: "winlogbeat-2023.11",
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
    console.error("Elasticsearch 查询错误:", error);
    res.status(500).json({ error: "Elasticsearch 查询错误" });
  }
});

// app.get("/getLogsData", async (req, res) => {
//   try {
//     const aggs = {
//       result: {
//         date_histogram: {
//           field: "@timestamp",
//           fixed_interval: "1d",
//           format: "MM-dd",
//         },
//       },
//     };

//     const result = await client.search({
//       index: "winlogbeat-2023.11",
//       size: 0,
//       aggs: aggs,
//     });

//     const data = result.aggregations.result.buckets;

//     res.json(data);
//   } catch (error) {
//     console.error("Elasticsearch查询错误:", error);
//     res.status(500).json({ error: "查询出错" });
//   }
// });

app.get("/", async (req, res) => {
  //獲取全部log
  try {
    const result = await client.search({
      index: "winlogbeat-2023.10",
      aggs: {
        result: {
          date_histogram: {
            field: "@timestamp",
            fixed_interval: "1d",
            format: "MM-dd",
          },
        },
      },
    });
    const perdayaggregations = result.aggregations.result.buckets;
    let label = [];
    let chartdata = [];
    perdayaggregations.forEach((item) => {
      label.push(item.key_as_string);
      chartdata.push(item.doc_count);
    });
    res.locals.label = label;
    res.locals.chartdata = chartdata;
  } catch (error) {
    console.error("找不到資料", error);
  }

  //獲取當周log
  try {
    const now = moment.utc();
    const start = moment.utc().subtract(6, "days");
    const startofday = new Date(start).setHours(0, 0, 0, 0);
    //console.log(now)
    //console.log(start)
    const result = await client.search({
      index: "winlogbeat-2023.11",
      body: {
        query: {
          range: {
            "@timestamp": {
              gte: startofday,
              lte: now,
            },
          },
        },
        aggs: {
          weeklyresult: {
            date_histogram: {
              field: "@timestamp",
              min_doc_count: 0,
              fixed_interval: "1d",
              format: "MM-dd",
              time_zone: "+08:00",
            },
          },
        },
      },
    });
    const weekly = result.aggregations.weeklyresult.buckets;
    let weeklylabel = [];
    let weeklychartdata = [];
    weekly.forEach((item) => {
      weeklylabel.push(item.key_as_string);
      weeklychartdata.push(item.doc_count);
    });
    res.locals.weeklylabel = weeklylabel;
    res.locals.weeklychartdata = weeklychartdata;
  } catch (error) {
    console.error("找不到資料", error);
  }
  //今日每小時資料
  try {
    const moment = require("moment");
    const daystart = moment().startOf("day");
    const dayend = moment();
    //console.log(daystart);
    //console.log(dayend);

    const result = await client.search({
      index: "winlogbeat-2023.11",
      body: {
        query: {
          range: {
            "@timestamp": {
              gte: daystart,
              lte: dayend,
            },
          },
        },
        aggs: {
          hourlyresult: {
            date_histogram: {
              field: "@timestamp",
              fixed_interval: "1h",
              format: "HH",
              time_zone: "+08:00",
              min_doc_count: 0,
            },
          },
        },
      },
    });
    const hourly = result.aggregations.hourlyresult.buckets;
    let hourlylabel = [];
    let hourlychartdata = [];
    const startOfDay = moment().startOf("day");
    const hoursInDay = Array.from({ length: 24 }, (_, i) =>
      startOfDay.clone().add(i, "hours")
    );

    hoursInDay.forEach((hour) => {
      const formattedHour = hour.format("HH");
      const foundHour = hourly.find(
        (item) => item.key_as_string === formattedHour
      );

      if (foundHour) {
        hourlylabel.push(foundHour.key_as_string);
        hourlychartdata.push(foundHour.doc_count);
      } else {
        hourlylabel.push(formattedHour);
        hourlychartdata.push(0);
      }
    });
    //console.log(hourlylabel);
    //console.log(hourlychartdata);
    /*hourly.forEach((item) => {
      hourlylabel.push(item.key_as_string);
      hourlychartdata.push(item.doc_count);
    });
    console.log(hourlylabel)
    */
    res.locals.hourlylabel = hourlylabel;
    res.locals.hourlychartdata = hourlychartdata;
  } catch (error) {}
  //獲取前五多的event_id
  try {
    const result = await client.search({
      index: "winlogbeat-2023.11",
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

  res.render("dashboard");
});

//查各種destinationIp有幾個(poker看這邊)
app.get("/getDestinationIp", async (req, res) => {
  try {
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

    const data = result.aggregations.result.buckets;
    console.log(data);

    // const countryData = await Promise.all(
    //   data.map(async (bucket) => {
    //     const ip = bucket.key;
    //     const ipInfo = await getCountryCityFromIp(ip);
    //     const count = bucket.doc_count;
    //     return { ip, ...ipInfo, count };
    //   })
    // );

    const countryData = await Promise.all(
      data.map(async (bucket) => {
        const ip = bucket.key;
        const count = bucket.doc_count;

        try {
          // 獲取城市信息
          const ip_data = await serviceClient.city(ip);
          console.log(ip_data);

          // 提取國家和城市信息
          let country = ip_data.country || ip_data.registeredCountry;
          if (country && country.isoCode) {
            country = country.isoCode;
          }
          console.log(country);

          return { ip, country, count };
        } catch (error) {
          console.error("讀取 GeoIP 數據時發生錯誤:", error);
          // 適當地處理錯誤，例如返回默認值或將數據標記為無效。
          return { ip, country: "Unknown", count };
        }
      })
    );

    console.log(countryData);
    res.json(countryData);
  } catch (error) {
    console.error("Elasticsearch 查詢錯誤:", error);
  }
});

async function getCountryCityFromIp(ip) {
  return new Promise((resolve, reject) => {
    // 使用 IP 地址轉換 API，這裡使用了一個示例的 API（ipinfo.io）
    const apiUrl = `http://ipinfo.io/${ip}/json`;

    request(apiUrl, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        const data = JSON.parse(body);
        const country = data.country;
        const city = data.city;
        resolve({ country, city });
      } else {
        reject(error || "Failed to retrieve country and city data");
      }
    });
  });
}

app.get("/search", (req, res) => {
  res.render("search", { logs: [], error: null });
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
