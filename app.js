const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const { Client } = require("@elastic/elasticsearch");

app.set("view engine", "ejs");

const client = new Client({ node: "http://localhost:9200" });

app.use(bodyParser.json());

app.get("/search1", async (req, res) => {
  try {
    let aggs = {
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

    res.json(result.aggregations.result.buckets);
  } catch (error) {
    console.error("Elasticsearch查詢錯誤:", error);
    res.status(500).json({ error: "Elasticsearch查詢失敗" });
  }
});

app.get("/logs", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.render("logs", {
        error: "Both startDate and endDate are required.",
      });
    }

    // 執行 Elasticsearch 查詢
    const result = await client.search({
      index: "winlogbeat-2023.10",
      size: 50, //數量
      body: {
        query: {
          range: {
            "@timestamp": {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    });

    const logs = result.hits.hits;

    res.render("index", { logs: logs, error: null });
  } catch (error) {
    console.error("Elasticsearch查询错误:", error);
    res.render("index", { logs: [], error: "No matching logs found." });
  }
});

app.get("/", (req, res) => {
  res.render("index", { logs: [], error: null });
});
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

//測試
async function searchLogs() {
  try {
    const result = await client.search({
      index: "winlogbeat-2023.10",
      size: 10,
      body: {
        query: {
          bool: {
            must: [
              { term: { "host.hostname": "LAPTOP-GPPNAMEN" } },
              {
                range: {
                  "@timestamp": {
                    gte: "2023-10-22T00:00:00.000Z",
                    lte: "2023-10-22T23:59:59.999Z",
                  },
                },
              },
            ],
          },
        },
      },
    });

    const logs = result.hits.hits;

    logs.forEach((log) => {
      const hostname = log._source.host.hostname;
      const timestamp = log._source["@timestamp"];
      console.log(`Hostname: ${hostname}, Timestamp: ${timestamp}`);
    });
  } catch (error) {
    console.error("Elasticsearch查詢錯誤:", error);
  }
}

searchLogs();
