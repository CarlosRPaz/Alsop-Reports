import fs from 'fs'

function parseCSV(text) {
  const rows = []
  let current = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        current.push(field)
        field = ""
      } else if (ch === "\n") {
        current.push(field)
        field = ""
        if (current.length > 1 || current[0] !== "") {
          rows.push(current)
        }
        current = []
      } else if (ch === "\r") {
      } else {
        field += ch
      }
    }
  }
  if (field || current.length > 0) {
    current.push(field)
    if (current.length > 1 || current[0] !== "") {
      rows.push(current)
    }
  }

  if (rows.length < 2) return []

  const headers = rows[0].map(h => h.trim())
  const result = []
  for (let r = 1; r < rows.length; r++) {
    const obj = {}
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (rows[r][c] || "").trim()
    }
    result.push(obj)
  }
  return result
}

const filePath = "C:\\Users\\scag3s29\\Documents\\Rico call report 1.csv"
console.log("Parsing", filePath)
const content = fs.readFileSync(filePath, 'utf8')
const rows = parseCSV(content)
console.log("Parsed rows:", rows.length)

const callStatuses = new Set()
const callTypes = new Set()
const currentStatuses = new Set()

const statusStats = {}

for (const row of rows) {
  const status = row["Call Status"] || "(empty)"
  const type = row["Call Type"] || "(empty)"
  const currStatus = row["Current Status"] || "(empty)"
  const sec = parseInt(row["Call Duration In Seconds"] || "0", 10) || 0

  callStatuses.add(status)
  callTypes.add(type)
  currentStatuses.add(currStatus)

  if (!statusStats[status]) {
    statusStats[status] = { count: 0, totalSeconds: 0 }
  }
  statusStats[status].count++
  statusStats[status].totalSeconds += sec
}

console.log("\nCall Statuses and their total duration:")
for (const [status, stat] of Object.entries(statusStats)) {
  const h = Math.floor(stat.totalSeconds / 3600)
  const m = Math.floor((stat.totalSeconds % 3600) / 60)
  const s = stat.totalSeconds % 60
  console.log(`- ${status.padEnd(20)}: ${String(stat.count).padStart(6)} calls | ${stat.totalSeconds} sec | ${h}h ${m}m ${s}s`)
}

console.log("\nCall Types:", Array.from(callTypes))
console.log("\nCurrent Statuses:", Array.from(currentStatuses))
