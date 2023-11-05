const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const { Client } = require("@elastic/elasticsearch");

app.use(express.static("public"));
app.set("view engine", "ejs");

const client = new Client({ node: "http://localhost:9200" }); //連自己的測試
// const client = new Client({
//   node: "http://192.168.56.107:9200", // Elasticsearch虛擬機的IP和端口
//   auth: {
//     username: "elastic", // Elasticsearch用戶名
//     password: "Ylpfc6TX4sySwhNs2p3f", // Elasticsearch密碼
//   },
// });

app.use(bodyParser.json());

app.get("/searchLogs", async (req, res) => {
  try {
    const { startDate, endDate, host } = req.query;

    if (!startDate || !endDate || !host) {
      return res.render("logs", {
        error: "StartDate, endDate, and host are all required.",
      });
    }

    const result = await client.search({
      index: "winlogbeat-2023.10",
      size: 1000,
      body: {
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
      },
    });

    const logs = result.hits.hits;
    console.log(logs[0]._source["@timestamp"]);

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
      index: "winlogbeat-2023.10",
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

app.get("/getLogsData", async (req, res) => {
  try {
    const aggs = {
      result: {
        date_histogram: {
          field: "@timestamp",
          fixed_interval: "1d",
          format: "MM-dd",
        },
      },
    };

    const result = await client.search({
      index: "winlogbeat-2023.10",
      size: 0,
      aggs: aggs,
    });

    const data = result.aggregations.result.buckets;

    res.json(data);
  } catch (error) {
    console.error("Elasticsearch查询错误:", error);
    res.status(500).json({ error: "查询出错" });
  }
});

app.get("/dashboard", async (req, res) => {
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
    res.render("dashboard", {
      label: label,
      chartdata: chartdata,
    });
  } catch (error) {
    console.error("找不到資料", error);
  }
});

app.get("/", (req, res) => {
  res.render("search", { logs: [], error: null });
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
