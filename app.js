const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const { Client } = require("@elastic/elasticsearch");

app.use(express.static("public"));
app.set("view engine", "ejs");

const client = new Client({ node: "http://localhost:9200" }); //連自己的測試
// const client = new Client({
//   node: "http://192.168.0.103:9200", // Elasticsearch虛擬機的IP和端口
//   auth: {
//     username: "elastic", // Elasticsearch用戶名
//     password: "R193XUF00LXgVlvVJmhx", // Elasticsearch密碼
//   },
// });

app.use(bodyParser.json());

app.get("/searchLogs", async (req, res) => {
  try {
    const { startDate, endDate, host, index, eventId } = req.query;

    if (!startDate || !endDate || !host || !index) {
      return res.render("logs", {
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
    console.log(logs[0]);

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
    console.log(log);
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

app.get("/dashboard", async (req, res) => {
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
    const now = new Date();
    const start = now.getTime() - 1000 * 60 * 60 * 24 * 7;
    const result = await client.search({
      index: "winlogbeat-2023.11",
      body: {
        query: {
          range: {
            "@timestamp": {
              gte: start,
              lte: now,
            },
          },
        },
        aggs: {
          weeklyresult: {
            date_histogram: {
              field: "@timestamp",
              fixed_interval: "1d",
              format: "MM-dd",
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
    console.log(weeklylabel);
    console.log(weeklychartdata);
    res.locals.weeklylabel = weeklylabel;
    res.locals.weeklychartdata = weeklychartdata;
  } catch (error) {
    console.error("找不到資料", error);
  }
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
    res.json(data);
  } catch (error) {
    console.error("Elasticsearch 查詢錯誤:", error);
  }
});

app.get("/", (req, res) => {
  res.render("search", { logs: [], error: null });
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
