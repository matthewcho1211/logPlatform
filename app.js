const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const { Client } = require("@elastic/elasticsearch");

app.set("view engine", "ejs");

//const client = new Client({ node: "http://localhost:9200" }); //連自己的測試
const client = new Client({
  node: "http://192.168.56.107:9200", // Elasticsearch虛擬機的IP和端口
  auth: {
    username: "elastic", // Elasticsearch用戶名
    password: "Ylpfc6TX4sySwhNs2p3f", // Elasticsearch密碼
  },
});

app.use(bodyParser.json());

app.get("/logs", async (req, res) => {
  try {
    const { startDate, endDate, host } = req.query;

    if (!startDate || !endDate || !host) {
      return res.render("logs", {
        error: "StartDate, endDate, and host are all required.",
      });
    }

    const result = await client.search({
      index: "winlogbeat-2023.10",
      size: 50,
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

    res.render("index", { logs: logs, error: null });
  } catch (error) {
    console.error("Elasticsearch查詢錯誤:", error);
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
