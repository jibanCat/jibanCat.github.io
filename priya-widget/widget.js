// widget.js — PRIYA 1P Emulator Explorer
// // Visualization inspired by:
//   - Observable D3: https://observablehq.com/@d3
//   - Bollinger Bands Example: https://observablehq.com/@d3/bollinger-bands
// And also the interactive CMB power spectra
// https://www.redshiftzero.com/cosmowebapp/

(async function () {
    const svg = d3.select("#chart");
    const width = +svg.attr("width");
    const height = +svg.attr("height");
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
  
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const color = d3.scaleOrdinal(d3.schemeTableau10);
  
    // Load data
    const data = await d3.json("sweep_1p_widget.json");
    const z_vals = data.z;
    const k_vals = data.k;
    const sweeps = data.sweeps;
    const paramNames = Object.keys(sweeps);
  
    // UI elements
    const select = d3.select("#param-select");
    const slider = d3.select("#slider");
    const paramValue = d3.select("#param-value");
  
    const paramDescriptions = {
        "dtau0": "Slope of mean optical depth",
        "tau0": "Mean optical depth normalization",
        "ns": "{rimeval power spectrum slope at 0.78 Mpc⁻¹",
        "Ap": "Primeval power spectrum amplitude at 0.78 Mpc⁻¹",
        "herei": "Start of He II reionization",
        "heref": "End of He II reionization",
        "alphaq": "Quasar spectral index during HeII reionization",
        "hub": "Hubble parameter",
        "omegamh2": "Total matter density",
        "hireionz": "HI reionization redshift",
        "bhfeedback": "Black hole feedback efficiency",
        "a_lls": "Strength of LLS correction",
        "a_sub": "Strength of sub-DLA correction"
      };

    // Populate dropdown
    select.selectAll("option")
      .data(paramNames)
      .join("option")
      .attr("value", d => d)
      .text(d => d);
  
    select.on("change", () => {
      const param = select.property("value");
      slider.attr("max", sweeps[param].length - 1);
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
      paramValue.text(`${param} = ${val.toExponential(2)}  (index ${idx + 1}/${sweep.length})`);
  
      // ✅ Update param description text
      d3.select("#param-description").text(paramDescriptions[param] || "");

      g.selectAll("*").remove();
  
      const allPk = sweep.flatMap(d => d.pk.flat());
      const x = d3.scaleLinear()
        .domain([0, d3.max(k_vals.flat()) * 1.1])
        .range([0, innerWidth]);
  
      const y = d3.scaleLog()
        .domain([d3.min(allPk) * 0.97, d3.max(allPk) * 1.12])
        .range([innerHeight, 0]);
  
    // 🟡 Add horizontal reference lines
    const refLines = [2e-1, 1e-1, 5e-2]; // or whatever y-values you'd like
    refLines.forEach(yval => {
    if (y.domain()[0] < yval && yval < y.domain()[1]) {
        g.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", y(yval))
        .attr("y2", y(yval))
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 3");

        // Optional label
        g.append("text")
        .attr("x", innerWidth - 5)
        .attr("y", y(yval) - 5)
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("fill", "#555")
        // .text(`P₁D = ${yval}`);
    }
    });        
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
        .text("k P₁D π⁻¹");
  
      // Plot current sweep line for each redshift
      sweep[idx].pk.forEach((pk, zi) => {
        const line = d3.line()
          .x((d, i) => x(k_vals[zi][i]))
          .y(d => y(d))
          .defined(d => d > 0);
      
        // Draw the line
        g.append("path")
          .datum(pk)
          .attr("fill", "none")
          .attr("stroke", color(zi))
          .attr("stroke-width", 2.0)
          .attr("d", line);
      
        // Label at the last valid point
        const lastIdx = pk.length - 1;
        const lastX = x(k_vals[zi][lastIdx]);
        const lastY = y(pk[lastIdx]);
      
        if (pk[lastIdx] > 0) {
          g.append("text")
            .attr("x", lastX + 5)
            .attr("y", lastY)
            .attr("font-size", "12px")
            .attr("fill", color(zi))
            .text(`z = ${z_vals[zi].toFixed(1)}`);
        }
      });
  
      // Plot midpoint reference line
      const midPk = sweep[Math.floor(sweep.length / 2)].pk;
      midPk.forEach((pk, zi) => {
        const line = d3.line()
          .x((d, i) => x(k_vals[zi][i]))
          .y(d => y(d))
          .defined(d => d > 0);
  
        g.append("path")
          .datum(pk)
          .attr("fill", "none")
          .attr("stroke", "#999")
          .attr("stroke-dasharray", "4 2")
          .attr("stroke-width", 1.5)
          .attr("d", line);
      });
    }
  
    // Initialize
    const initialParam = paramNames[0];
    select.property("value", initialParam);
    slider.attr("max", sweeps[initialParam].length - 1);
    slider.property("value", Math.floor(sweeps[initialParam].length / 2));
    updatePlot(initialParam, Math.floor(sweeps[initialParam].length / 2));
  })();