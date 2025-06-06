(async function () {
    const svg = d3.select("#chart");
    const width = +svg.attr("width");
    const height = +svg.attr("height");
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
  
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  
    const color = d3.scaleOrdinal(d3.schemeTableau10);
  
    const data = await d3.json("sweep_1p_widget.json");
    const z_vals = data.z;
    const k_vals = data.k;
    const sweeps = data.sweeps;
    const paramNames = Object.keys(sweeps);
  
    const select = d3.select("#param-select");
    const slider = d3.select("#slider");
    const paramValue = d3.select("#param-value");
  
    // === Populate parameter dropdown ===
    select.selectAll("option")
      .data(paramNames)
      .join("option")
      .attr("value", d => d)
      .text(d => d);
  
    select.on("change", () => {
      const param = select.property("value");
      slider.attr("max", sweeps[param].length - 1); // 🆕 update max on change
      slider.property("value", Math.floor(sweeps[param].length / 2));
      updatePlot(param, +slider.property("value"));
    });
  
    slider.on("input", () => {
      const param = select.property("value");
      const index = +slider.property("value");
      updatePlot(param, index);
    });
  
    function updatePlot(param, idx) {
      const sweep = sweeps[param];
      const val = sweep[idx].val;
  
      // 🆕 Show current parameter value + slider index
      paramValue.text(`${param} = ${val.toExponential(2)}  (index ${idx + 1}/${sweep.length})`);
  
      g.selectAll("*").remove(); // clear previous content
  
      const allPk = sweep.flatMap(d => d.pk.flat());
      const x = d3.scaleLinear()
        .domain([0, d3.max(k_vals.flat())])
        .range([0, innerWidth]);
  
      const y = d3.scaleLog()
        .domain([d3.min(allPk) * 0.97, d3.max(allPk) * 1.12]) // small buffer
        .range([innerHeight, 0]);
  
      const xAxis = d3.axisBottom(x);
      const yAxis = d3.axisLeft(y).ticks(10, ".1e");
  
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(xAxis)
        .append("text")
        .attr("x", innerWidth / 2)
        .attr("y", 35)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .text("k [s/km]");
  
      g.append("g")
        .call(yAxis)
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -45)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .text("P₁D [π⁻¹]");
  
      const line = d3.line()
        .x((d, i) => x(k_vals[0][i]))
        .y(d => y(d))
        .defined(d => d > 0);
  
      // 🔵 Current sweep line
      sweep[idx].pk.forEach((pk, zi) => {
        g.append("path")
          .datum(pk)
          .attr("fill", "none")
          .attr("stroke", color(zi))
          .attr("stroke-width", 2.0)
          .attr("d", line);
      });
  
      // ⚪ Midpoint reference line
      const midPk = sweep[Math.floor(sweep.length / 2)].pk;
      midPk.forEach((pk, zi) => {
        g.append("path")
          .datum(pk)
          .attr("fill", "none")
          .attr("stroke", "#999")
          .attr("stroke-dasharray", "4 2")
          .attr("stroke-width", 1.5)
          .attr("d", line);
      });
    }
  
    // 🔧 Init
    const initialParam = paramNames[0];
    select.property("value", initialParam);
    slider.attr("max", sweeps[initialParam].length - 1);
    slider.property("value", Math.floor(sweeps[initialParam].length / 2));
    updatePlot(initialParam, Math.floor(sweeps[initialParam].length / 2));
  })();
