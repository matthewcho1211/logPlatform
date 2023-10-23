const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const { Client } = require("@elastic/elasticsearch");

app.set("view engine", "ejs");

const client = new Client({ node: "http://localhost:9200" });

app.use(bodyParser.json());

app.get("/logs", async (req, res) => {
  try {
    const { startDate, endDate, host } = req.query;

    if (!startDate || !endDate || !host) {
      return res.render("logs", {
        error: "StartDate, endDate, and host are all required.",
      });
    }

    // 执行 Elasticsearch 查询，包括主机过滤条件
    const result = await client.search({
      index: "winlogbeat-2023.10",
      size: 50, // 适当调整
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
                  "host.hostname": host, // 通过 host.keyword 字段过滤主机
                },
              },
            ],
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
