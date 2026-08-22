/**
 * Render a clean styled table into `container`.
 * rows: array of objects
 * columns: optional array of column keys to display (defaults to keys of first row)
 * cellRenderers: optional { [column]: (value, row) => htmlString } to override cell HTML
 */
export function renderTable(container, rows, { columns, cellRenderers = {} } = {}) {
  container.innerHTML = "";

  if (!rows || rows.length === 0) {
    const div = document.createElement("div");
    div.className = "alert alert-info";
    div.textContent = "No data available.";
    container.appendChild(div);
    return;
  }

  const cols = columns && columns.length ? columns : Object.keys(rows[0]);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "custom-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const c of cols) {
      const td = document.createElement("td");
      td.setAttribute("data-col", c);
      if (cellRenderers[c]) {
        td.innerHTML = cellRenderers[c](row[c], row);
      } else {
        td.textContent = row[c] ?? "";
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
  container.appendChild(wrap);
}
