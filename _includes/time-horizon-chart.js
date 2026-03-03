const SHOW_CONFIDENCE_AREA = false; // Set to true to show shaded confidence interval

// Chart constants
const TREND_LINE_POINTS = 120; // Number of points for smooth trend line
const CONFIDENCE_INTERVAL_T_VALUE = 1.96; // 95% confidence interval
const LABEL_RADIUS = 6; // Radius for data point dots
const LABEL_RADIUS_NARROW = 5; // Smaller radius for narrow mobile screens
const ERROR_BAR_CAP_WIDTH = 8;
const RESIZE_DEBOUNCE_DELAY = 250; // ms

let ANIMATION_DURATION = 750; // ms
let chartClickHandler = null;
const AUTO_SWITCH_ANIMATION_DURATION = 1500; // ms - slower transition for auto-switch

// Screen size helpers - uses container width for responsive layout
function getScreenSize(containerWidth = null) {
  // Use container width if provided, otherwise fall back to viewport width
  const width = containerWidth || window.innerWidth;
  return {
    isNarrowMobile: width <= 430,
    isMobile: width < 576,
    isSmallMobile: width <= 500,
    // hasHover stays viewport-based since it's about device capability
    hasHover: window.matchMedia('(any-hover: hover)').matches
  };
}

const FRONTIER_COLOR = '#2e7d32';
const NON_FRONTIER_COLOR = '#9e9e9e';

// Overlap detection threshold (in pixels)
const OVERLAP_THRESHOLD = LABEL_RADIUS * 1.5;

// Global state variables to persist across resizes
let isLogScale = window.location.pathname !== '/';
let currentProbability = 'p50';

// Track active timeouts to cancel them if needed
let timeouts = {
  labelTransition: null,
  backgroundUpdate: null,
  taskDescription: null
};

// Auto-switch to linear scale on homepage
let autoSwitchTimeout = null;
let autoSwitchDone = false;

const TASK_DESCRIPTIONS = {
  logScale: {
    p50: [
      { hours: 16, text: 'Implement complex protocol from multiple RFCs' },
      { hours: 4, text: 'Train adversarially robust image model' },
      { hours: 0.82, text: 'Train classifier' }, // 49 min
      { hours: 0.17, text: 'Find fact on web' }, // 10 min
      { hours: 0.03, text: 'Count words in passage' }, // 2 min
      { hours: 0.00417, text: 'Answer question' } // 15 sec
    ],
    p80: [
      { hours: 0.82, text: 'Train classifier' }, // 49 min
      { hours: 0.17, text: 'Find fact on web' }, // 10 min
      { hours: 0.03, text: 'Count words in passage' }, // 2 min
      { hours: 0.00417, text: 'Answer question' } // 15 sec
    ]
  },
  linearScale: {
    p50: [
      { hours: 14.62, text: 'Fix complex bug in ML research codebase' }, // 14 hr 37 min
      { hours: 8.07, text: 'Exploit a vulnerable Ethereum smart contract' }, // 8 hr 4 min
      { hours: 4, text: 'Train adversarially robust image model' },
      { hours: 2.3, text: 'Exploit a buffer overflow in libiec61850' },
      { hours: 1.2, text: 'Fix bugs in small Python libraries' },
    ],
    p80: [
      { hours: 0.82, text: 'Train classifier' }, // 49 min
      { hours: 0.383, text: 'Implement a simple webserver' }, // 23 min
      { hours: 0.283, text: 'Implement a dictionary attack' }, // 17 min
      { hours: 0.17, text: 'Find fact on web' }, // 10 min
    ]
  }
};

function probabilityArticle(probability) {
  return probability === 'p50' ? 'a' : 'an';
}

function probabilityText(probability) {
  return probability === 'p50' ? '50%' : '80%';
}

function probabilityArticleText(probability) {
  return `${probabilityArticle(probability)} ${probabilityText(probability)}`;
}

function configureYScale(data, isLogScale, height) {
  if (isLogScale) {
    const minValue = Math.min(0.01, d3.min(data, d => d.horizonLength) * 0.5);
    return d3.scaleLog()
      .domain([minValue, d3.max(data, d => d.horizonLength) * 1.5])
      .range([height, 0]);
  } else {
    const maxDataValue = d3.max(data, d => d.horizonLength);
    let yScaleMax = maxDataValue * 1.1;
    // If maxValue is close to an integer, round up to next integer for cleaner scale
    if (Math.ceil(yScaleMax) < yScaleMax + 0.25) {
      yScaleMax = Math.ceil(maxDataValue);
    }
    return d3.scaleLinear()
      .domain([0, yScaleMax])
      .range([height, 0]);
  }
}

function getTaskDescriptions(isLog, probability) {
  const scaleKey = isLog ? 'logScale' : 'linearScale';
  return TASK_DESCRIPTIONS[scaleKey][probability] || [];
}

function generateLogScaleTicks(data) {
  const minValue = Math.min(0.01, d3.min(data, d => d.horizonLength) * 0.5);
  const maxValue = d3.max(data, d => d.horizonLength);
  const logTicks = [];
  let tickValue = 0.001;
  while (tickValue < maxValue * 2) {
    if (tickValue >= minValue) {
      logTicks.push(tickValue);
    }
    tickValue *= 10;
  }
  return logTicks;
}

function generateLinearScaleTicks(data, currentProbability) {
  const maxValue = d3.max(data, d => d.horizonLength);
  const tickValues = [];
  tickValues.push(0);

  if (maxValue < 0.5) {
    // Very small values - use minute increments
    const steps = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];
    steps.forEach(v => {
      if (v <= maxValue) tickValues.push(v);
    });
  } else if (maxValue < 1) {
    // Small values - use 15-30 minute increments
    tickValues.push(0.25, 0.5, 0.75);
    if (maxValue > 0.75) tickValues.push(1);
  } else {
    // Normal range - use same pattern as initial load
    tickValues.push(0.5);

    for (let i = 1; i <= Math.ceil(maxValue); i++) {
      tickValues.push(i);
    }
  }

  return tickValues;
}

// Detect overlapping dots and group them together
// Returns array of groups, where each group is an array of data points that overlap
function detectOverlappingDots(data, xScale, yScale) {
  const groups = [];
  const assigned = new Set();

  // Sort by release date so earlier models come first in groups
  const sortedData = [...data].sort((a, b) => a.releaseDate - b.releaseDate);

  for (let i = 0; i < sortedData.length; i++) {
    if (assigned.has(sortedData[i].id)) continue;

    const group = [sortedData[i]];
    assigned.add(sortedData[i].id);

    const x1 = xScale(sortedData[i].releaseDate);
    const y1 = yScale(sortedData[i].horizonLength);

    // Find all points that overlap with this one
    for (let j = i + 1; j < sortedData.length; j++) {
      if (assigned.has(sortedData[j].id)) continue;

      const x2 = xScale(sortedData[j].releaseDate);
      const y2 = yScale(sortedData[j].horizonLength);

      const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

      if (distance < OVERLAP_THRESHOLD) {
        group.push(sortedData[j]);
        assigned.add(sortedData[j].id);
      }
    }

    groups.push(group);
  }

  return groups;
}

function formatTickLabel(d) {
  if (d === 0) return '0';
  if (d < 0.001) return '0';
  if (d < 0.016) return `${Math.round(d * 3600)} sec`;
  if (d < 1) {
    const minutes = Math.round(d * 60);
    return minutes === 30 ? '30 min' : `${minutes} min`;
  }
  const hours = Math.floor(d);
  const fractionalHours = d - hours;
  if (Math.abs(fractionalHours - 0.5) < 0.001) {
    return `${hours}h 30m`;
  }
  return d === 1 ? '1 hour' : `${d} hours`;
}

function generateGridTicks(isLogScale, yScale, tickValues, maxValue) {
  if (isLogScale) {
    return [0.001, 0.01, 0.1, 1, 10].filter(v => v >= yScale.domain()[0] && v <= yScale.domain()[1]);
  } else {
    // For linear scale, ensure we have reasonable grid lines
    if (maxValue < 0.5) {
      // For small values, use every other tick value to avoid overcrowding
      let gridTickValues = tickValues.filter((v, i) => v > 0 && i % 2 === 1);
      // Ensure we have at least 2-3 grid lines
      if (gridTickValues.length < 2) {
        gridTickValues = tickValues.filter(v => v > 0).slice(0, 3);
      }
      return gridTickValues;
    } else {
      // For normal range, use standard grid lines that fit within the range
      let gridTickValues = [0.5, 1, 1.5].filter(v => v <= maxValue * 1.1);
      // Add more grid lines if needed
      if (maxValue > 1.5) {
        for (let i = 2; i <= Math.ceil(maxValue); i += 0.5) {
          gridTickValues.push(i);
        }
      }
      return gridTickValues;
    }
  }
}

function calculateTrendLine(frontierData) {
  if (frontierData.length <= 2) {
    return null;
  }

  // Fit exponential curve: y = a * e^(b * x)
  // Transform to linear regression: ln(y) = ln(a) + b * x
  const regressionData = frontierData.map(d => ({
    x: (d.releaseDate.getTime() - new Date('2020-01-01').getTime()) / (365.25 * 24 * 60 * 60 * 1000), // years since 2020
    y: Math.log(Math.max(d.horizonLength, 1e-7)) // Clip to avoid log(0)
  }));

  // Calculate linear regression coefficients
  const n = regressionData.length;
  const sumX = regressionData.reduce((sum, d) => sum + d.x, 0);
  const sumY = regressionData.reduce((sum, d) => sum + d.y, 0);
  const sumXY = regressionData.reduce((sum, d) => sum + d.x * d.y, 0);
  const sumXX = regressionData.reduce((sum, d) => sum + d.x * d.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate residuals for standard error
  const ssResidual = regressionData.reduce((sum, d) => {
    const yPred = intercept + slope * d.x;
    return sum + Math.pow(d.y - yPred, 2);
  }, 0);

  // Calculate standard error for confidence intervals
  const xMean = sumX / n;
  const se = Math.sqrt(ssResidual / (n - 2));
  const sxx = sumXX - n * xMean * xMean;

  // Get the date range of the actual data
  const dataMinDate = d3.min(frontierData, d => d.releaseDate);
  const dataMaxDate = d3.max(frontierData, d => d.releaseDate);

  // Define the date range for the trend line
  const startDate = new Date('2019-01-01');
  const endDate = new Date('2026-01-01');

  // Generate smooth curve points for the entire range
  const curvePoints = [];
  const numPoints = TREND_LINE_POINTS;
  const timeSpan = endDate.getTime() - startDate.getTime();
  const tValue = CONFIDENCE_INTERVAL_T_VALUE;

  for (let i = 0; i <= numPoints; i++) {
    const date = new Date(startDate.getTime() + (i / numPoints) * timeSpan);
    const x = (date.getTime() - new Date('2020-01-01').getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const logY = intercept + slope * x;
    const y = Math.exp(logY);

    // Calculate confidence interval in log space
    const seY = se * Math.sqrt(1/n + Math.pow(x - xMean, 2) / sxx);
    const logYLower = logY - tValue * seY;
    const logYUpper = logY + tValue * seY;
    const yLower = Math.exp(logYLower);
    const yUpper = Math.exp(logYUpper);

    // Only include points within reasonable bounds
    if (y < 1000 && y > 1e-7) {
      curvePoints.push({
        date: date,
        value: y,
        lower: yLower,
        upper: yUpper
      });
    }
  }

  // Split into segments based on data range
  const solidPoints = curvePoints.filter(p => p.date >= dataMinDate && p.date <= dataMaxDate);
  const dashedBeforePoints = curvePoints.filter(p => p.date < dataMinDate);
  const dashedAfterPoints = curvePoints.filter(p => p.date > dataMaxDate);

  return {
    curvePoints,
    solidPoints,
    dashedBeforePoints,
    dashedAfterPoints
  };
}

// Clip screen points so the trend line stops at the x-axis instead of extending below it.
// Interpolates boundary crossings for a clean intersection point.
function clipScreenPointsAtBottom(points, chartHeight) {
  if (points.length === 0) return points;
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const inBounds = points[i].screenY <= chartHeight;
    if (i > 0) {
      const prevInBounds = points[i - 1].screenY <= chartHeight;
      if (inBounds && !prevInBounds) {
        // Entering chart from below: interpolate entry point
        const prev = points[i - 1], curr = points[i];
        const t = (chartHeight - prev.screenY) / (curr.screenY - prev.screenY);
        result.push({
          date: new Date(prev.date.getTime() + t * (curr.date.getTime() - prev.date.getTime())),
          screenY: chartHeight
        });
      }
      if (!inBounds && prevInBounds) {
        // Leaving chart through bottom: interpolate exit point
        const prev = points[i - 1], curr = points[i];
        const t = (chartHeight - prev.screenY) / (curr.screenY - prev.screenY);
        result.push({
          date: new Date(prev.date.getTime() + t * (curr.date.getTime() - prev.date.getTime())),
          screenY: chartHeight
        });
      }
    }
    if (inBounds) result.push(points[i]);
  }
  return result;
}

// Model display names mapping
const modelMetadata = {
  'gpt2': { name: 'GPT-2' },
  'davinci_002': { name: 'GPT-3' },
  'gpt_3_5_turbo_instruct': { name: 'GPT-3.5' },
  'gpt_4': { name: 'GPT-4' },
  'gpt_4_turbo': { name: 'GPT-4 Turbo' },
  'gpt_4_1106': { name: 'GPT-4 Nov \'23' },
  'gpt_4_0125': { name: 'GPT-4 Jan \'24' },
  'gpt_4o': { name: 'GPT-4o', link: 'https://evaluations.metr.org/gpt-4o-report/' },
  'claude_3_opus': { name: 'Claude 3 Opus' },
  'qwen_2_72b': { name: 'Qwen2-72B' },
  'claude_3_5_sonnet': { name: 'Claude 3.5 Sonnet (Old)', link: 'https://evaluations.metr.org/claude-3-5-sonnet-report/' },
  'claude_3_5_sonnet_20240620': { name: 'Claude 3.5 Sonnet (Old)', link: 'https://evaluations.metr.org/claude-3-5-sonnet-report/' },
  'claude_3_5_sonnet_20241022': { name: 'Claude 3.5 Sonnet (New)' },
  'o1_preview': { name: 'o1-preview', link: 'https://evaluations.metr.org/openai-o1-preview-report/' },
  'qwen_2_5_72b': { name: 'Qwen2.5-72B', link: 'https://evaluations.metr.org/deepseek-qwen-report/' },
  'o1_elicited': { name: 'o1' },
  'deepseek_v3': { name: 'DeepSeek-V3', link: 'https://evaluations.metr.org/deepseek-v3-report/' },
  'deepseek_r1': { name: 'DeepSeek-R1', link: 'https://evaluations.metr.org/deepseek-r1-report/' },
  'claude_3_7_sonnet': { name: 'Claude 3.7 Sonnet', link: 'https://evaluations.metr.org/claude-3-7-report/' },
  'deepseek_v3_0324': { name: 'DeepSeek-V3-0324', link: 'https://evaluations.metr.org/deepseek-qwen-report/' },
  'o4-mini': { name: 'o4-mini', link: 'https://evaluations.metr.org/openai-o3-report/' },
  'o3': { name: 'o3', link: 'https://evaluations.metr.org/openai-o3-report/' },
  'claude_4_opus': { name: 'Claude Opus 4', link: 'https://x.com/METR_Evals/status/1940088546385436738' },
  'claude_4_sonnet': { name: 'Claude Sonnet 4', link: 'https://x.com/METR_Evals/status/1940088546385436738' },
  'deepseek_r1_0528': { name: 'DeepSeek-R1-0528', link: 'https://evaluations.metr.org/deepseek-qwen-report/' },
  'gemini_2_5_pro_preview': { name: 'Gemini 2.5 Pro Preview' },
  'grok_4': { name: 'Grok 4', link: 'https://x.com/METR_Evals/status/1950740117020389870' },
  'gpt_5_2025_08_07': { name: 'GPT-5', link: 'https://evaluations.metr.org/gpt-5-report/' },
  'gpt_5': { name: 'GPT-5', link: 'https://evaluations.metr.org/gpt-5-report/' },
  'claude_4_1_opus': { name: 'Claude Opus 4.1', link: 'https://x.com/METR_Evals/status/1961527692072993272' },
  'claude_sonnet_4_5': { name: 'Claude Sonnet 4.5', link: 'https://x.com/METR_Evals/status/1976331315772580274' },
  'claude_opus_4_5': { name: 'Claude Opus 4.5', link: 'https://x.com/METR_Evals/status/2002203627377574113' },
  'claude_opus_4_6': { name: 'Claude Opus 4.6', link: 'https://x.com/METR_Evals/status/2024923422867030027' },
  'gpt-oss-120b': { name: 'gpt-oss-120b' },
  'gpt_5_1_codex_max': { name: 'GPT-5.1-Codex-Max', link: 'https://evaluations.metr.org/gpt-5-1-codex-max-report/' },
  'gemini_3_pro': { name: 'Gemini 3 Pro', link: 'https://x.com/METR_Evals/status/2018752230376210586' },
  'kimi_k2_thinking': { name: 'Kimi K2 Thinking (inference via Novita AI)', link: 'https://x.com/METR_Evals/status/1991658241932292537' },
  'gpt_5_2': { name: 'GPT-5.2 (high)', link: 'https://x.com/METR_Evals/status/2019169900317798857' },
  'gpt_5_3_codex': { name: 'GPT-5.3-Codex (high)', link: 'https://x.com/METR_Evals/status/2025035574118416460' },
};

// Calculate frontier status for each probability level
function calculateFrontierStatus(processedData) {
  const sortedData = [...processedData].sort((a, b) => a.releaseDate - b.releaseDate);

  // Track the maximum horizonLength seen so far for each probability level
  let maxP50 = 0;
  let maxP80 = 0;

  sortedData.forEach(model => {
    // For p50: check if this model has the highest p50.horizonLength seen so far
    if (model.p50.horizonLength > maxP50) {
      model.frontier_p50 = true;
      maxP50 = model.p50.horizonLength;
    } else {
      model.frontier_p50 = false;
    }

    // For p80: check if this model has the highest p80.horizonLength seen so far
    if (model.p80.horizonLength > maxP80) {
      model.frontier_p80 = true;
      maxP80 = model.p80.horizonLength;
    } else {
      model.frontier_p80 = false;
    }
  });

  return sortedData;
}

// Convert benchmark data to chart format
function processData(benchmarkData) {
  const results = benchmarkData.results;
  const processedData = [];

  for (const [modelKey, modelData] of Object.entries(results)) {
    // Strip "_inspect" suffix when looking up metadata
    const metadataKey = modelKey.replace(/_inspect$/, '');
    const metadata = modelMetadata[metadataKey] || modelMetadata[modelKey] || {
      name: metadataKey
    };

    const agentData = modelData.metrics;

    if (agentData && agentData.p50_horizon_length) {
      processedData.push({
        id: modelKey,
        name: metadata.name,
        link: metadata.link || null,
        releaseDate: new Date(modelData.release_date),
        // Store both p50 and p80 data
        p50: {
          horizonLength: agentData.p50_horizon_length.estimate / 60, // Convert to hours
          ciLow: agentData.p50_horizon_length.ci_low / 60,
          ciHigh: agentData.p50_horizon_length.ci_high / 60
        },
        p80: {
          horizonLength: agentData.p80_horizon_length ? agentData.p80_horizon_length.estimate / 60 : 0,
          ciLow: agentData.p80_horizon_length ? agentData.p80_horizon_length.ci_low / 60 : 0,
          ciHigh: agentData.p80_horizon_length ? agentData.p80_horizon_length.ci_high / 60 : 0
        },
        // Default to p50
        horizonLength: agentData.p50_horizon_length.estimate / 60,
        ciLow: agentData.p50_horizon_length.ci_low / 60,
        ciHigh: agentData.p50_horizon_length.ci_high / 60,
        frontier: agentData.is_sota || false,
        averageScore: agentData.average_score.estimate,
        benchmarkName: modelData.benchmark_name || null
      });
    }
  }

  // Calculate frontier status for p50 and p80
  const dataWithFrontiers = calculateFrontierStatus(processedData);

  return dataWithFrontiers.sort((a, b) => a.releaseDate - b.releaseDate);
}

// Calculate position for a single label (shared by initial render and scale-toggle update)
function calculateSingleLabelPosition(d, xScale, yScale, height, { screenSize, rightmostPoint, labelMargin, charWidth }) {
  const x = xScale(d.releaseDate);
  const y = yScale(d.horizonLength);
  const estimatedWidth = d.name.length * charWidth;
  const isRightmost = d.name === rightmostPoint.name;

  let labelX, anchor;

  if (screenSize.isNarrowMobile) {
    labelX = x - labelMargin;
    anchor = 'end';
  } else if (isRightmost) {
    labelX = x + labelMargin;
    anchor = 'start';
  } else {
    labelX = x - labelMargin;
    anchor = 'end';
    if (x - labelMargin - estimatedWidth < 20) {
      labelX = x + labelMargin;
      anchor = 'start';
    }
  }

  let labelY = y + 4;
  if (y > height - 20) {
    labelY = height - 5;
  }

  return { labelX, labelY, anchor, isRightmost };
}

// Detect which labels should be visible based on overlap
function detectVisibleLabels(data, xScale, yScale, height, options = {}) {
  const { maxLabels = Infinity, containerWidth = null } = options;
  const screenSize = getScreenSize(containerWidth);
  const visibleLabels = new Set();
  const labelPositions = {};
  const labelWidths = {};
  const labelMargin = screenSize.isNarrowMobile ? 6 : 8;
  const labelHeight = screenSize.isNarrowMobile ? 12 : 14;
  const dotRadius = screenSize.isNarrowMobile ? LABEL_RADIUS_NARROW : LABEL_RADIUS;
  // Use smaller character width estimate for narrow screens (smaller font)
  const charWidth = screenSize.isNarrowMobile ? 5.5 : 7;

  // Find the latest model(s)
  const latestDate = d3.max(data, d => d.releaseDate);
  const latestModels = data.filter(d => d.releaseDate.getTime() === latestDate.getTime());

  // If there are multiple models with the same latest date, choose the one with highest p50
  let latestModel;
  if (latestModels.length > 1) {
    latestModel = latestModels.reduce((a, b) => a.horizonLength > b.horizonLength ? a : b);
  } else {
    latestModel = latestModels[0];
  }

  const rightmostPoint = latestModel;

  // On narrow screens, pre-select which models we'll even consider showing
  // to drastically reduce label clutter
  let candidateModels = data;
  if (screenSize.isNarrowMobile) {
    // On very narrow screens, only consider: latest model + top frontier models
    const frontierModels = data.filter(d => d.frontier && d.name !== latestModel.name);
    // Sort frontier by horizonLength descending, pick top 3
    const topFrontier = frontierModels
      .sort((a, b) => b.horizonLength - a.horizonLength)
      .slice(0, 3);
    candidateModels = [latestModel, ...topFrontier];
  } else if (screenSize.isSmallMobile) {
    // On small (but not narrowest) screens, be slightly less aggressive
    const frontierModels = data.filter(d => d.frontier && d.name !== latestModel.name);
    const topFrontier = frontierModels
      .sort((a, b) => b.horizonLength - a.horizonLength)
      .slice(0, 5);
    candidateModels = [latestModel, ...topFrontier];
  }

  // Sort data by priority: latest model first, then frontier models, then by y position
  const sortedData = [...candidateModels].sort((a, b) => {
    // Latest model always comes first
    if (a.name === latestModel.name) return -1;
    if (b.name === latestModel.name) return 1;

    // Then frontier models
    if (a.frontier !== b.frontier) return b.frontier - a.frontier;

    // Then by y position
    return yScale(a.horizonLength) - yScale(b.horizonLength);
  });

  // Check overlaps
  sortedData.forEach((d, i) => {
    // Enforce max labels limit
    if (visibleLabels.size >= maxLabels) return;

    // Estimate label width (rough approximation)
    labelWidths[d.name] = d.name.length * charWidth;

    const { labelX, labelY, anchor } = calculateSingleLabelPosition(d, xScale, yScale, height, {
      screenSize, rightmostPoint, labelMargin, charWidth
    });

    // On narrow screens, if too close to left edge, skip this label entirely
    if (screenSize.isNarrowMobile && xScale(d.releaseDate) - labelMargin - labelWidths[d.name] < 10) {
      labelPositions[d.name] = { x: labelX, y: 0, anchor: anchor, tooCloseToEdge: true };
      return; // Skip to next iteration
    }

    // Store position
    labelPositions[d.name] = {
      x: labelX,
      y: labelY,
      anchor: anchor
    };

    // Check for overlaps with already placed labels and data points
    let hasOverlap = false;

    // Check overlap with other labels
    for (let j = 0; j < i; j++) {
      const other = sortedData[j];
      if (!visibleLabels.has(other.name)) continue;

      const otherPos = labelPositions[other.name];
      if (!otherPos) continue;

      // Calculate actual label bounds based on anchor
      const thisLeft = anchor === 'end' ? labelX - labelWidths[d.name] : labelX;
      const thisRight = anchor === 'end' ? labelX : labelX + labelWidths[d.name];
      const otherLeft = otherPos.anchor === 'end' ? otherPos.x - labelWidths[other.name] : otherPos.x;
      const otherRight = otherPos.anchor === 'end' ? otherPos.x : otherPos.x + labelWidths[other.name];

      // Check overlap - use larger margin on narrow screens to give more breathing room
      const overlapMargin = screenSize.isNarrowMobile ? 8 : 5;
      const xOverlap = thisRight > otherLeft && thisLeft < otherRight;
      const yOverlap = Math.abs(labelY - otherPos.y) < labelHeight + overlapMargin;

      if (xOverlap && yOverlap) {
        hasOverlap = true;
        break;
      }
    }

    // Check overlap with ALL data points (not just previous ones)
    if (!hasOverlap) {
      for (const point of data) {
        // Skip checking overlap with the point's own dot
        if (point.name === d.name) continue;

        const pointX = xScale(point.releaseDate);
        const pointY = yScale(point.horizonLength);

        // Calculate label bounds
        const labelLeft = anchor === 'end' ? labelX - labelWidths[d.name] : labelX;
        const labelRight = anchor === 'end' ? labelX : labelX + labelWidths[d.name];
        const labelTop = labelY - labelHeight / 2;
        const labelBottom = labelY + labelHeight / 2;

        // Check if label overlaps with point (including some margin)
        const margin = 3;
        if (labelLeft < pointX + dotRadius + margin &&
            labelRight > pointX - dotRadius - margin &&
            labelTop < pointY + dotRadius + margin &&
            labelBottom > pointY - dotRadius - margin) {
          hasOverlap = true;
          break;
        }
      }
    }

    // Always show the latest model's label, otherwise only show if no overlap
    if (d.name === latestModel.name || !hasOverlap) {
      visibleLabels.add(d.name);
    }
  });

  return { visibleLabels, labelPositions, rightmostPoint };
}

// Position labels with overlap detection
function positionLabels(labels, backgrounds, data, xScale, yScale, height, containerWidth = null) {
  // Use the shared overlap detection logic
  const { visibleLabels, labelPositions, rightmostPoint } = detectVisibleLabels(data, xScale, yScale, height, { containerWidth });

  const labelMargin = 8;
  const labelHeight = 14;
  const labelWidths = {};

  // Pre-calculate label widths
  data.forEach(d => {
    labelWidths[d.name] = d.name.length * 7;
  });

  // Apply positions and visibility
  labels.each(function(d, i) {
    // Use stored positions if available, otherwise calculate default
    let labelX, labelY, anchor;

    if (labelPositions[d.name]) {
      labelX = labelPositions[d.name].x;
      labelY = labelPositions[d.name].y;
      anchor = labelPositions[d.name].anchor;
    } else {
      // Fallback to default positioning
      const x = xScale(d.releaseDate);
      const y = yScale(d.horizonLength);

      labelX = x - labelMargin;
      labelY = y - labelHeight + 9;
      anchor = 'end';

      if (labelX - labelWidths[d.name] / 2 < 20) {
        labelX = x + labelMargin;
        anchor = 'start';
      }
    }

    const isVisible = visibleLabels.has(d.name);
    const isRightmost = d.name === rightmostPoint.name;

    // if d.name is over 35 characters skip
    if (d.name.length > 35) {
      return;
    }

    // Clear any existing content
    d3.select(this).selectAll('*').remove();

    // Position text
    d3.select(this)
      .attr('x', labelX)
      .attr('y', labelY)
      .attr('text-anchor', anchor)
      .style('display', isVisible ? 'block' : 'none');

    // Check if we should split the label (rightmost and long)
    const shouldSplit = isRightmost && d.name.length > 12;

    if (shouldSplit) {
      // Split label at space closest to middle
      const words = d.name.split(' ');
      let line1, line2;

      if (words.length >= 2) {
        // Find best split point (closest to middle)
        let bestSplit = 1;
        let bestDiff = Math.abs(words[0].length - (d.name.length / 2));

        for (let i = 1; i < words.length - 1; i++) {
          const firstPart = words.slice(0, i + 1).join(' ');
          const diff = Math.abs(firstPart.length - (d.name.length / 2));
          if (diff < bestDiff) {
            bestDiff = diff;
            bestSplit = i + 1;
          }
        }

        line1 = words.slice(0, bestSplit).join(' ');
        line2 = words.slice(bestSplit).join(' ');
      } else {
        // No spaces, just use as single line
        line1 = d.name;
        line2 = null;
      }

      if (line2) {
        // Adjust y position to center the two-line text
        const adjustedY = labelY - 6; // Move up slightly to center both lines

        // For centered text, adjust x position based on anchor
        let centerX = labelX;
        if (anchor === 'start') {
          // Estimate half width of longest line
          const maxLength = Math.max(line1.length, line2.length);
          centerX = labelX + (maxLength * 7) / 2; // Approximate half width
        } else if (anchor === 'end') {
          const maxLength = Math.max(line1.length, line2.length);
          centerX = labelX - (maxLength * 7) / 2;
        }

        d3.select(this)
          .attr('y', adjustedY)
          .attr('text-anchor', 'middle'); // Override to center both lines

        // Add two tspan elements for line break
        d3.select(this).append('tspan')
          .attr('x', centerX)
          .attr('dy', 0)
          .text(line1);

        d3.select(this).append('tspan')
          .attr('x', centerX)
          .attr('dy', '1.2em')
          .text(line2);
      } else {
        // Single line (no spaces to split)
        d3.select(this).text(d.name);
      }
    } else {
      // Regular single-line text
      d3.select(this).text(d.name);
    }

    // Position background rectangle
    if (isVisible) {
      const bbox = this.getBBox();
      const paddingX = 3;
      const paddingY = -0.75;

      d3.select(backgrounds.nodes()[i])
        .attr('x', bbox.x - paddingX)
        .attr('y', bbox.y - paddingY)
        .attr('width', bbox.width + 2 * paddingX)
        .attr('height', bbox.height + 2 * paddingY)
        .style('display', 'block');
    } else {
      d3.select(backgrounds.nodes()[i])
        .style('display', 'none');
    }
  });
}

function renderTaskDescriptions(g, taskDescriptions, yScale, height, options = {}) {
  const {
    animate = false,
    animationDuration = 0
  } = options;

  taskDescriptions.forEach(task => {
    if (yScale(task.hours) >= 0 && yScale(task.hours) <= height) {
      // Add connecting line
      const line = g.append('line')
        .attr('class', 'task-connector')
        .attr('x1', 0)
        .attr('x2', 8)
        .attr('y1', yScale(task.hours))
        .attr('y2', yScale(task.hours))
        .style('stroke', '#999')
        .style('stroke-width', 1);

      if (animate) {
        line.style('opacity', 0)
          .transition()
          .duration(animationDuration)
          .style('opacity', 1);
      }

      // Add text
      let y = yScale(task.hours);
      task.text.split('\n').forEach((line, index) => {
        let adjustedY = y;
        if (y > height - 20) {
          // prevent low tick labels colliding with the labels of the early models
          adjustedY = y - 8;
        }
        const text = g.append('text')
          .attr('class', 'task-description')
          .attr('x', 12)
          .attr('y', adjustedY)
          .attr('dy', '0.35em')
          .style('font-size', '13px')
          .style('fill', '#666')
          .style('text-anchor', 'start')
          .text(line);

        if (animate) {
          text.style('opacity', 0)
            .transition()
            .duration(animationDuration)
            .style('opacity', 1);
        }

        y += 16;
      });
    }
  });
}

function configureYAxis(yScale, data, isLogScale, currentProbability) {
  const tickValues = isLogScale
    ? generateLogScaleTicks(data)
    : generateLinearScaleTicks(data, currentProbability);

  return d3.axisLeft(yScale)
    .tickValues(tickValues)
    .tickFormat(formatTickLabel);
}

function initChart() {
  // Sync button active state with initial scale (handles ?scale=linear)
  d3.select('#linear-scale').classed('active', !isLogScale);
  d3.select('#log-scale').classed('active', isLogScale);

  const data = processData(benchmarkData);

  if (currentProbability === 'p80') {
    data.forEach(d => {
      d.horizonLength = d.p80.horizonLength;
      d.ciLow = d.p80.ciLow;
      d.ciHigh = d.p80.ciHigh;
    });
  }

  const container = d3.select('#time-horizon-chart');
  const containerRect = container.node().getBoundingClientRect();

  // Cap container width to available viewport space (fixes Firefox Android overflow)
  const rightPadding = 10;
  const availableWidth = Math.min(containerRect.width, window.innerWidth - containerRect.left - rightPadding);

  // Use container width for responsive sizing (supports container queries)
  const screenSize = getScreenSize(containerRect.width);
  const { isMobile, isNarrowMobile, isSmallMobile, hasHover } = screenSize;
  const compactView = document.querySelector('.compact-view-marker');

  // Adjust margins based on container size
  // On narrow containers, reduce right margin since labels are all on the left
  const margin = {
    top: isMobile ? (isNarrowMobile ? 45 : 80) : 60,
    right: isMobile ? (isNarrowMobile ? 24 : 84) : 80,
    bottom: isNarrowMobile ? 40 : 20,
    left: isMobile ? (isNarrowMobile ? 40 : 90) : 100,
  };

  if (compactView) margin.left = isMobile ? 50 : 70;
  const width = availableWidth - margin.left - margin.right;

  let baseHeight = 500;
  if (!window.isEmbedMode && isMobile) baseHeight = 400;

  const height = baseHeight - margin.top - margin.bottom;

  // Use smaller dot radius on narrow screens
  const dotRadius = isNarrowMobile ? LABEL_RADIUS_NARROW : LABEL_RADIUS;

  const svg = container.append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .style('font-family', 'Montserrat, sans-serif')
    .style('overflow', 'visible');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Create scales
  const xScale = d3.scaleTime()
    .domain([new Date('2019-01-01'), new Date('2026-01-01')])
    .range([0, width]);

  let yScale = configureYScale(data, isLogScale, height);

  // Create axes
  // Reduce tick count on narrow screens
  const xTickCount = isNarrowMobile ? 4 : (isMobile ? 5 : 7);
  const xAxis = d3.axisBottom(xScale)
    .ticks(xTickCount)
    .tickFormat(d => {
      const year = d.getFullYear();
      return year === 2019 ? '' : d3.timeFormat('%Y')(d);
    });

  let yAxis = configureYAxis(yScale, data, isLogScale, currentProbability);

  // Add grid
  g.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .tickSize(-height)
      .tickFormat(''));

  // Custom horizontal grid lines
  if (isLogScale) {
    const logTicks = generateLogScaleTicks(data);
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale)
        .tickValues(logTicks)
        .tickSize(-width)
        .tickFormat(''));
  } else {
    // For linear scale, use custom tick values
    const maxValue = d3.max(data, d => d.horizonLength);
    const tickValues = generateLinearScaleTicks(data, currentProbability);
    const gridTickValues = generateGridTicks(false, yScale, tickValues, maxValue);
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale)
        .tickValues(gridTickValues)
        .tickSize(-width)
        .tickFormat(''));
  }

  // Add axes
  g.append('g')
    .attr('class', 'axis x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis);

  g.select('.x-axis .domain').attr('d', `M0,0H${width}V0`);

  const yAxisGroup = g.append('g')
    .attr('class', 'axis y-axis')
    .call(yAxis);

  // Left-align the title on narrow viewports; center it on wide screens.
  const shouldLeftAlign = window.innerWidth <= 1250;
  const isMediumScreen = containerRect.width >= 576 && containerRect.width <= 1450;

  let yLabel;

  // Add white background rectangle for title
  const titleBgRect = svg.append('rect')
    .attr('class', 'title-background')
    .attr('x', 0)
    .attr('y', -5)
    .attr('fill', 'white')
    .attr('opacity', 1);

  // Add chart title - position higher on narrow mobile
  const titleY = isNarrowMobile ? 15 : (isMobile ? 25 : margin.top / 2 - 5);
  const chartTitle = svg.append('text')
    .attr('class', 'chart-title')
    .attr('x', shouldLeftAlign ? 0 : margin.left + width / 2)
    .attr('y', titleY)
    .style('text-anchor', shouldLeftAlign ? 'start' : 'middle');

  // Check screen width and adjust title accordingly
  if (!compactView) {
    if (isNarrowMobile) {
      // Narrow mobile: single line title, smaller font
      chartTitle.append('tspan')
        .style('font-size', '14px')
        .text('LLM Time Horizon, METR Software Tasks');
    } else if (!isMobile) {
      const titleTextLine1 = isMediumScreen ?
        'Time horizon of software tasks ' :
        'The time horizon of software tasks different LLMs';
      const titleTextLine2 = isMediumScreen ? `different LLMs can complete <tspan class="current-probability">${probabilityText(currentProbability)}</tspan> of the time` : `can complete <tspan class="current-probability">${probabilityText(currentProbability)}</tspan> of the time`;
      chartTitle.append('tspan')
        .attr('x', shouldLeftAlign ? 0 : margin.left + width / 2)
        .html(titleTextLine1);
      chartTitle.append('tspan')
        .attr('x', shouldLeftAlign ? 0 : margin.left + width / 2)
        .attr('dy', '1.2em')
        .html(titleTextLine2);
    } else {
      // Regular mobile: 3 line title
      const titleTextLine1 = 'Time horizon of software tasks';
      const titleTextLine2 = 'different LLMs can complete';
      const titleTextLine3 = `a <tspan class="current-probability">${probabilityText(currentProbability)}</tspan> of the time`;
      chartTitle.append('tspan')
        .attr('x', shouldLeftAlign ? 0 : margin.left + width / 2)
        .html(titleTextLine1);
      chartTitle.append('tspan')
        .attr('x', shouldLeftAlign ? 0 : margin.left + width / 2)
        .attr('dy', '1.2em')
        .html(titleTextLine2);
      chartTitle.append('tspan')
        .attr('x', shouldLeftAlign ? 0 : margin.left + width / 2)
        .attr('dy', '1.2em')
        .html(titleTextLine3);
    }

    // Update title background rectangle dimensions based on title size
    // Use requestAnimationFrame to ensure text is fully rendered before measuring
    requestAnimationFrame(() => {
      const titleBBox = chartTitle.node().getBBox();
      const titlePaddingX = 10;
      const titlePaddingY = 2;

      // Set dimensions to match title text with padding
      titleBgRect
        .attr('x', titleBBox.x - titlePaddingX)
        .attr('width', titleBBox.width + titlePaddingX * 2)
        .attr('height', titleBBox.y + titleBBox.height + titlePaddingY);

      updateYAxisDomainLine(false);
    });

    console.log('Adding y-axis label, isMobile:', isMobile, 'isNarrowMobile:', isNarrowMobile);

    if (isMobile) {
      // No y-axis label on mobile
      yLabel = null;
    } else {
      // Desktop: rotated label on the left
      yLabel = g.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left - 10)
        .attr('x', 0 - (height / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle');

      // First line - bigger
      yLabel.append('tspan')
        .style('font-size', '16px')
        .style('font-weight', '500')
        .text('Task duration (for humans)');

      // Second line
      yLabel.append('tspan')
        .attr('x', 0 - (height / 2))
        .attr('dy', '1.2em')
        .style('font-size', '12px')
        .html('where logistic regression of our data');

      // Third line
      yLabel.append('tspan')
        .attr('x', 0 - (height / 2))
        .attr('dy', '1.2em')
        .style('font-size', '12px')
        .html(`predicts the AI has <tspan class="a-current-probability">${probabilityArticleText(currentProbability)}</tspan> chance of succeeding`);
    }

    g.append('text')
      .attr('class', 'axis-label')
      .attr('transform', `translate(${width / 2}, ${height + margin.bottom + 20})`)
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .text('LLM release date');
  }
  // Add task duration descriptions to the right of the y-axis
  // Hide on narrow screens to reduce clutter
  if (!isNarrowMobile) {
    const taskDescriptions = getTaskDescriptions(isLogScale, currentProbability);
    renderTaskDescriptions(g, taskDescriptions, yScale, height);
  }

  // Create tooltip
  const tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip');

  // For tooltips with links, use a delay so user can move mouse to click the link
  let hideTimeout = null;
  let isMouseOverTooltip = false;

  // Add hover handlers to tooltip element
  tooltip.on('mouseenter', function() {
    isMouseOverTooltip = true;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  });

  tooltip.on('mouseleave', function() {
    isMouseOverTooltip = false;
    hideTooltip();
  });

  // On touch devices, dismiss tooltip when tapping elsewhere
  if (!hasHover) {
    if (chartClickHandler) {
      document.removeEventListener('click', chartClickHandler);
    }
    chartClickHandler = function(event) {
      // Don't hide if clicking on a dot, label, or the tooltip itself
      const isDataPoint = event.target.closest('.dot, .model-label, .tooltip');
      if (!isDataPoint) {
        hideTooltip();
      }
    };
    document.addEventListener('click', chartClickHandler);
  }

  // Prevent the homepage chart link wrapper from navigating on touch taps,
  // while still allowing mouse/trackpad clicks to navigate
  const chartLink = document.querySelector('a > #time-horizon-chart')?.closest('a');
  if (chartLink) {
    let lastPointerType = 'mouse';
    chartLink.addEventListener('pointerdown', function(event) {
      lastPointerType = event.pointerType;
    });
    chartLink.addEventListener('click', function(event) {
      if (lastPointerType === 'touch') {
        event.preventDefault();
      }
    });
  }

  function showTooltip(event, d) {
    // Cancel any pending hide
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    const reportType = (d.link && (d.link.includes('twitter.com') || d.link.includes('x.com'))) ? 'X thread' : 'report';

    const reportLink = d.link
      ? `<p><a href="${d.link}" target="_blank" rel="noopener noreferrer">View our ${reportType}</a></p>`
      : '';

    // Extract version from benchmark_name (e.g., "METR-Horizon-v1.1" -> "v1.1")
    const versionFromBenchmark = d.benchmarkName ? d.benchmarkName.split('-').pop() : null;
    const versionLabel = versionFromBenchmark ? `TH ${versionFromBenchmark.replace('v', '')}` : (currentDataVersion === 'TH 1.1' ? 'TH 1.1' : 'TH 1.0');

    tooltip.style('opacity', 1);
    tooltip.html(`
      <h4>${d.name}</h4>
      <p><strong>Release:</strong> ${d3.timeFormat('%B %Y')(d.releaseDate)}</p>
      <p><strong>Task Length:</strong> ${formatDuration(d.horizonLength)}</p>
      <p><strong>95% CI:</strong> ${formatDuration(d.ciLow)} - ${formatDuration(d.ciHigh)}</p>
      <p><strong>Average Score:</strong> ${(d.averageScore * 100).toFixed(1)}%</p>
      <p><strong>Version:</strong> ${versionLabel}</p>
      ${reportLink}
    `);

    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth;
    const windowWidth = window.innerWidth;
    const scrollX = window.scrollX;

    let left = event.pageX + 10;
    let top = event.pageY - 28;

    if (left + tooltipWidth > windowWidth + scrollX - 10) {
      left = event.pageX - tooltipWidth - 10;
    }

    if (left < scrollX + 10) {
      left = scrollX + 10;
    }

    tooltip
      .style('left', left + 'px')
      .style('top', top + 'px')
      .style('pointer-events', 'auto');
  }

  function hideTooltip() {
    tooltip.style('opacity', 0);
    tooltip.style('pointer-events', 'none');
  }

  function handleMouseOut(_, d) {
    // If tooltip has a link, delay hiding to give user time to move to tooltip
    if (d && d.link) {
      hideTimeout = setTimeout(function() {
        if (!isMouseOverTooltip) {
          hideTooltip();
        }
      }, 150);
    } else {
      hideTooltip();
    }
  }

  // Add error bars
  let errorBars = g.selectAll('.error-bar')
    .data(data)
    .enter().append('line')
    .attr('class', d => `error-bar ${d.frontier ? 'frontier' : 'non-frontier'}`)
    .attr('x1', d => xScale(d.releaseDate))
    .attr('x2', d => xScale(d.releaseDate))
    .attr('y1', d => Math.min(yScale(d.ciLow), height)) // Clip at x-axis
    .attr('y2', d => Math.max(yScale(d.ciHigh), 0)) // Clip at top of chart
    .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR)
    .attr('stroke-width', 1)
    .attr('opacity', 0.2)
    .attr('data-model-name', d => d.name);

  // Add error bar caps
  const capWidth = ERROR_BAR_CAP_WIDTH;
  let errorBarCapsTop = g.selectAll('.error-bar-cap-top')
    .data(data)
    .enter().append('line')
    .attr('class', 'error-bar-cap error-bar-cap-top')
    .attr('x1', d => xScale(d.releaseDate) - capWidth / 2)
    .attr('x2', d => xScale(d.releaseDate) + capWidth / 2)
    .attr('y1', d => yScale(d.ciHigh))
    .attr('y2', d => yScale(d.ciHigh))
    .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR)
    .attr('stroke-width', 1)
    .attr('opacity', 0.2)
    .style('display', d => yScale(d.ciHigh) <= 0 ? 'none' : 'block'); // Hide if above chart

  let errorBarCapsBottom = g.selectAll('.error-bar-cap-bottom')
    .data(data)
    .enter().append('line')
    .attr('class', 'error-bar-cap error-bar-cap-bottom')
    .attr('x1', d => xScale(d.releaseDate) - capWidth / 2)
    .attr('x2', d => xScale(d.releaseDate) + capWidth / 2)
    .attr('y1', d => yScale(d.ciLow))
    .attr('y2', d => yScale(d.ciLow))
    .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR)
    .attr('stroke-width', 1)
    .attr('opacity', 0.2)
    .style('display', d => yScale(d.ciLow) >= height ? 'none' : 'block'); // Hide if at or below x-axis

  // Create a group for trend lines (before dots and labels so they appear behind)
  const trendlineGroup = g.append('g')
    .attr('class', 'trendline-group');

  // Detect overlapping dots
  let overlappingGroups = detectOverlappingDots(data, xScale, yScale);

  // Create a map of data point id to its group info
  let overlapInfo = new Map();
  overlappingGroups.forEach(group => {
    if (group.length > 1) {
      group.forEach((d, idx) => {
        overlapInfo.set(d.id, { group, index: idx, total: group.length });
      });
    }
  });

  // Create dot groups container
  const dotGroups = g.append('g').attr('class', 'dots-container');

  // Render single dots (non-overlapping)
  const singleDots = data.filter(d => !overlapInfo.has(d.id));
  let dots = dotGroups.selectAll('.dot')
    .data(singleDots, d => d.id)
    .enter().append('circle')
    .attr('class', d => `dot ${d.frontier ? 'frontier' : 'non-frontier'}`)
    .attr('r', dotRadius)
    .attr('cx', d => xScale(d.releaseDate))
    .attr('cy', d => yScale(d.horizonLength))
    .attr('data-model-name', d => d.name);

  if (hasHover) {
    dots.on('mouseover', showTooltip)
      .on('mouseout', handleMouseOut);
  } else {
    dots.on('click', function(event, d) {
      event.preventDefault();
      event.stopPropagation();
      showTooltip(event, d);
    });
  }

  // Render split dots (overlapping pairs)
  const splitDotGroups = overlappingGroups.filter(group => group.length === 2);
  splitDotGroups.forEach(group => {
    // Sort by release date to ensure earlier model gets left side
    const sorted = [...group].sort((a, b) => a.releaseDate - b.releaseDate);
    const [leftModel, rightModel] = sorted;

    // Use the average position for the split dot
    const cx = (xScale(leftModel.releaseDate) + xScale(rightModel.releaseDate)) / 2;
    const cy = (yScale(leftModel.horizonLength) + yScale(rightModel.horizonLength)) / 2;
    const r = dotRadius;

    // Create a group for this split dot
    const splitGroup = dotGroups.append('g')
      .attr('class', 'split-dot-group')
      .attr('transform', `translate(${cx}, ${cy})`);

    // Left semicircle (earlier model)
    const leftHalf = splitGroup.append('path')
      .attr('class', `dot-half dot-half-left ${leftModel.frontier ? 'frontier' : 'non-frontier'}`)
      .attr('d', `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} L 0 0 Z`)
      .attr('data-model-name', leftModel.name)
      .datum(leftModel);

    // Right semicircle (later model)
    const rightHalf = splitGroup.append('path')
      .attr('class', `dot-half dot-half-right ${rightModel.frontier ? 'frontier' : 'non-frontier'}`)
      .attr('d', `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} L 0 0 Z`)
      .attr('data-model-name', rightModel.name)
      .datum(rightModel);

    // Divider line
    splitGroup.append('line')
      .attr('class', 'split-dot-divider')
      .attr('x1', 0)
      .attr('y1', -r)
      .attr('x2', 0)
      .attr('y2', r)
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5);

    // Add event handlers
    if (hasHover) {
      leftHalf.on('mouseover', function(event) { showTooltip(event, leftModel); })
        .on('mouseout', function(event) { handleMouseOut(event, leftModel); });
      rightHalf.on('mouseover', function(event) { showTooltip(event, rightModel); })
        .on('mouseout', function(event) { handleMouseOut(event, rightModel); });
    } else {
      leftHalf.on('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        showTooltip(event, leftModel);
      });
      rightHalf.on('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        showTooltip(event, rightModel);
      });
    }
  });

  // Handle groups with more than 2 overlapping dots (rare case - just show all as split)
  const largeSplitGroups = overlappingGroups.filter(group => group.length > 2);
  largeSplitGroups.forEach(group => {
    // For now, just render them as regular overlapping dots
    // This is a rare edge case
    group.forEach(d => {
      const dot = dotGroups.append('circle')
        .attr('class', `dot ${d.frontier ? 'frontier' : 'non-frontier'}`)
        .attr('r', dotRadius)
        .attr('cx', xScale(d.releaseDate))
        .attr('cy', yScale(d.horizonLength))
        .attr('data-model-name', d.name)
        .datum(d);
      if (hasHover) {
        dot.on('mouseover', function(event) { showTooltip(event, d); })
          .on('mouseout', function(event) { handleMouseOut(event, d); });
      } else {
        dot.on('click', function(event) {
          event.preventDefault();
          event.stopPropagation();
          showTooltip(event, d);
        });
      }
    });
  });

  // Add model name labels with background (after dots and trend lines)
  const labelGroups = g.selectAll('.model-label-group')
    .data(data)
    .enter().append('g')
    .attr('class', 'model-label-group');

  // Add white background rectangles
  let labelBackgrounds = labelGroups.append('rect')
    .attr('class', 'model-label-bg');

  // Add text labels
  const labelFontSize = isNarrowMobile ? '10px' : '12px';
  let labels = labelGroups.append('text')
    .attr('class', 'model-label')
    .style('font-size', labelFontSize)
    .style('fill', 'var(--color-secondary)')
    .style('font-weight', '500')

  if (hasHover) {
    labels.on('mouseover', showTooltip)
      .on('mouseout', handleMouseOut);
  } else {
    labels.on('click', function(event, d) {
      event.preventDefault();
      event.stopPropagation();
      showTooltip(event, d);
    });
  }

  // Position labels with overlap detection
  positionLabels(labels, labelBackgrounds, data, xScale, yScale, height, containerRect.width);

  // Add exponential trend line for frontier models
  const frontierData = data.filter(d => d.frontier);
  let dashedPathBefore = null;
  let dashedPathAfter = null;

  const trendLineData = calculateTrendLine(frontierData);

  if (trendLineData) {
    const { curvePoints, solidPoints, dashedBeforePoints, dashedAfterPoints } = trendLineData;

    // Create line generator
    const line = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Create area generator for confidence interval
    const area = d3.area()
      .x(d => xScale(d.date))
      .y0(d => yScale(Math.min(d.upper, 1000))) // Clip to chart bounds
      .y1(d => yScale(Math.max(d.lower, 0.0001)))
      .curve(d3.curveMonotoneX);

    // Draw confidence interval shaded area (for all points)
    if (SHOW_CONFIDENCE_AREA && curvePoints.length > 0) {
      trendlineGroup.append('path')
        .datum(curvePoints)
        .attr('class', 'confidence-area')
        .attr('fill', FRONTIER_COLOR)
        .attr('opacity', 0.1)
        .attr('d', area)
        .style('pointer-events', 'none');
    }

    if (SHOW_CONFIDENCE_AREA) {
      // Draw dashed line before data (with reduced opacity)
      if (dashedBeforePoints.length > 0) {
        dashedPathBefore = trendlineGroup.append('path')
          .datum(dashedBeforePoints)
          .attr('fill', 'none')
          .attr('stroke', FRONTIER_COLOR)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
          .attr('opacity', 0.4)
          .attr('d', line)
          .style('pointer-events', 'none');
      }

      // Draw solid line within data range
      if (solidPoints.length > 0) {
        trendPath = trendlineGroup.append('path')
          .datum(solidPoints)
          .attr('fill', 'none')
          .attr('stroke', FRONTIER_COLOR)
          .attr('stroke-width', 2)
          .attr('opacity', 0.8)
          .attr('d', line)
          .style('pointer-events', 'none');
      }

      // Draw dashed line after data (with reduced opacity)
      if (dashedAfterPoints.length > 0) {
        dashedPathAfter = trendlineGroup.append('path')
          .datum(dashedAfterPoints)
          .attr('fill', 'none')
          .attr('stroke', FRONTIER_COLOR)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
          .attr('opacity', 0.4)
          .attr('d', line)
          .style('pointer-events', 'none');
      }
    } else {
      // When confidence area is disabled, draw entire line as dashed
      if (curvePoints.length > 0) {
        // Store raw (unclipped) screen coordinates for smooth transitions;
        // clip only at render time so old/new date grids always match.
        const rawScreenPoints = curvePoints.map(p => ({
          ...p,
          screenY: yScale(p.value)
        }));
        const clippedScreenPoints = clipScreenPointsAtBottom(rawScreenPoints, height);
        const screenLine = d3.line()
          .x(d => xScale(d.date))
          .y(d => d.screenY)
          .curve(d3.curveMonotoneX);
        trendPath = trendlineGroup.append('path')
          .datum(rawScreenPoints)
          .attr('fill', 'none')
          .attr('stroke', FRONTIER_COLOR)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
          .attr('opacity', 0.6)
          .attr('d', screenLine(clippedScreenPoints))
          .style('pointer-events', 'none');
      }
    }
  }

  // Add logo for container widths 750px and above
  // Note: Logo is appended after all other elements so it appears on top
  let logoGroup;
  if (containerRect.width >= 750) {
    const logoHeight = 24;

    const estimatedLogoWidth = logoHeight * 4;
    const logoPadding = margin.right - 20; // Padding from right edge

    // Position it in the top right, right-aligned
    // Position from the right edge of the SVG: full SVG width minus logo width minus padding
    const logoMarginY = containerRect.width >= 1024 ? 32 : 16;
    const svgWidth = width + margin.left + margin.right;
    const logoLeft = svgWidth - estimatedLogoWidth - logoPadding;

    logoGroup = svg.append('g')
      .attr('class', 'chart-logo')
      .attr('transform', `translate(${logoLeft}, ${logoMarginY})`);

    // Add white background rectangle behind logo - make it larger to ensure coverage
    logoGroup.append('rect')
      .attr('x', -10)
      .attr('y', -5)
      .attr('width', estimatedLogoWidth + 20)
      .attr('height', logoHeight + 10)
      .attr('fill', 'white')
      .attr('opacity', 1); // Full opacity to completely hide overlapping elements

    // Create clickable area
    const logoLink = logoGroup.append('a')
      .attr('href', '/')
      .style('text-decoration', 'none');

    // Add logo image
    logoLink.append('image')
      .attr('href', '/assets/images/logo/logo.svg')
      .attr('height', logoHeight)
      .attr('preserveAspectRatio', 'xMidYMin meet')
      .attr('class', 'logo-image');
  }

  // Function to set frontier values based on probability level
  function setFrontierValues(probability) {
    if (probability === 50) {
      data.forEach(d => {
        d.frontier = d.frontier_p50;
      });
    } else if (probability === 80) {
      data.forEach(d => {
        d.frontier = d.frontier_p80;
      });
    }

    // Update visual elements based on new frontier status
    // Use classed() instead of attr('class') to preserve other classes like 'exiting'
    dots.classed('frontier', d => d.frontier)
      .classed('non-frontier', d => !d.frontier);
    errorBars
      .classed('frontier', d => d.frontier)
      .classed('non-frontier', d => !d.frontier)
      .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR);
    errorBarCapsTop
      .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR);
    errorBarCapsBottom
      .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR);
  }

  // Probability toggle
  function setProbability(probability) {
    if (currentProbability === probability) return;

    currentProbability = probability;

    d3.select('#p50').classed('active', probability === 'p50');
    d3.select('#p80').classed('active', probability === 'p80');

    setFrontierValues(probability === 'p50' ? 50 : 80);

    const probKey = probability;
    data.forEach(d => {
      d.horizonLength = d[probKey].horizonLength;
      d.ciLow = d[probKey].ciLow;
      d.ciHigh = d[probKey].ciHigh;
    });

    if (!compactView && yLabel) {
      const tspans = yLabel.selectAll('tspan');
      const tspanCount = tspans.size();
      if (tspanCount === 3) {
        // Desktop or regular mobile with 3 tspans
        tspans.filter((_, i) => i === 0).text('Task duration (for humans)');
        tspans.filter((_, i) => i === 1).text('where logistic regression of our data');
        if (!isMobile) {
          tspans.filter((_, i) => i === 2).html(`predicts the AI has <tspan class="a-current-probability">${probabilityArticleText(probability)}</tspan> chance of succeeding`);
        } else {
          tspans.filter((_, i) => i === 2).html(`predicts the AI has ${probabilityArticle(probability)} <tspan class="current-probability">${probabilityText(probability)}</tspan> chance of succeeding`);
        }
      }
    }

    yScale = configureYScale(data, isLogScale, height);
    updateChart();
  }

  d3.select('#p50').on('click', () => setProbability('p50'));
  d3.select('#p80').on('click', () => setProbability('p80'));

  function setScale(useLogScale) {
    if (isLogScale === useLogScale) return;

    isLogScale = useLogScale;

    d3.select('#linear-scale').classed('active', !useLogScale);
    d3.select('#log-scale').classed('active', useLogScale);

    yScale = configureYScale(data, useLogScale, height);
    updateChart();
  }

  d3.select('#linear-scale').on('click', () => setScale(false));
  d3.select('#log-scale').on('click', () => setScale(true));

  // Auto-switch to log scale on homepage after 2 seconds,
  // unless the user is hovering over the chart or controls.
  if (window.location.pathname === '/' && !autoSwitchDone) {
    if (autoSwitchTimeout) {
      clearTimeout(autoSwitchTimeout);
    }

    let isHoveringChart = false;
    const chartArea = document.querySelector('.time-horizon-chart-container');

    const onEnter = () => { isHoveringChart = true; };
    const onLeave = () => { isHoveringChart = false; };

    if (chartArea) {
      chartArea.addEventListener('mouseenter', onEnter);
      chartArea.addEventListener('mouseleave', onLeave);
    }

    const GLOW_FADE_IN = 500;
    const GLOW_HOLD_AT_PEAK = 250;
    const GLOW_HOLD_AFTER = 750;

    // Start glow 500ms before the 2s mark so it reaches peak 500ms before scale change
    setTimeout(() => {
      if (autoSwitchDone || isHoveringChart) return;
      const toggle = document.querySelector('.scale-toggle');
      // Phase 1: fade in glow
      if (toggle) toggle.classList.add('effect-glow');
    }, 2000 - GLOW_FADE_IN - GLOW_HOLD_AT_PEAK);

    autoSwitchTimeout = setTimeout(() => {
      autoSwitchDone = true;
      if (chartArea) {
        chartArea.removeEventListener('mouseenter', onEnter);
        chartArea.removeEventListener('mouseleave', onLeave);
      }
      if (!isHoveringChart) {
        const toggle = document.querySelector('.scale-toggle');
        // Phase 2: start scale change (glow already at peak)
        ANIMATION_DURATION = AUTO_SWITCH_ANIMATION_DURATION;
        setScale(true);
        ANIMATION_DURATION = 750;
        // Phase 3: hold glow during transition + 1000ms, then fade out
        setTimeout(() => {
          if (toggle) toggle.classList.remove('effect-glow');
        }, AUTO_SWITCH_ANIMATION_DURATION + GLOW_HOLD_AFTER);
      } else {
        // User is hovering, remove glow without scale change
        const toggle = document.querySelector('.scale-toggle');
        if (toggle) toggle.classList.remove('effect-glow');
      }
    }, 2000);
  }

  // Data source toggle - exposed globally for the dropdown to call
  function setDataSource() {
    // First, immediately remove any elements that are in exit transitions
    // This prevents issues when switching data sources before previous transitions complete
    g.selectAll('.dot.exiting').interrupt('exit').remove();
    g.selectAll('.error-bar.exiting').interrupt('exit').remove();
    g.selectAll('.error-bar-cap-top.exiting').interrupt('exit').remove();
    g.selectAll('.error-bar-cap-bottom.exiting').interrupt('exit').remove();
    g.selectAll('.model-label-group.exiting').interrupt('exit').remove();
    // Resolve any still-entering groups from a previous switch
    g.selectAll('.model-label-group.entering')
      .classed('entering', false)
      .interrupt('enter')
      .style('opacity', 1);

    // Remove split dot groups - they'll be rebuilt after data update
    g.selectAll('.split-dot-group').remove();

    // Reprocess data from the (updated) global benchmarkData
    const newProcessedData = processData(benchmarkData);
    const newDataMap = new Map(newProcessedData.map(d => [d.id, d]));
    const oldDataMap = new Map(data.map(d => [d.id, d]));

    // Find models to add, update, and remove
    const toAdd = newProcessedData.filter(d => !oldDataMap.has(d.id));
    const toRemove = data.filter(d => !newDataMap.has(d.id));
    const toUpdate = data.filter(d => newDataMap.has(d.id));

    // Remove old items from data array first (before any DOM operations)
    toRemove.forEach(d => {
      const idx = data.indexOf(d);
      if (idx > -1) data.splice(idx, 1);
    });

    // Update existing items in the data array
    toUpdate.forEach(d => {
      const newD = newDataMap.get(d.id);
      d.p50 = newD.p50;
      d.p80 = newD.p80;
      d.frontier = newD.frontier;
      d.frontier_p50 = newD.frontier_p50;
      d.frontier_p80 = newD.frontier_p80;
      d.averageScore = newD.averageScore;
      d.benchmarkName = newD.benchmarkName;

      const probKey = currentProbability;
      d.horizonLength = d[probKey].horizonLength;
      d.ciLow = d[probKey].ciLow;
      d.ciHigh = d[probKey].ciHigh;
    });

    // Prepare new items with current probability values
    toAdd.forEach(d => {
      const probKey = currentProbability;
      d.horizonLength = d[probKey].horizonLength;
      d.ciLow = d[probKey].ciLow;
      d.ciHigh = d[probKey].ciHigh;
    });

    // Add new items to data array
    toAdd.forEach(d => data.push(d));

    // Re-sort data by release date
    data.sort((a, b) => a.releaseDate - b.releaseDate);

    // Recalculate frontier status
    const sortedForFrontier = [...data].sort((a, b) => a.releaseDate - b.releaseDate);
    let maxP50 = 0, maxP80 = 0;
    sortedForFrontier.forEach(model => {
      model.frontier_p50 = model.p50.horizonLength > maxP50;
      if (model.frontier_p50) maxP50 = model.p50.horizonLength;
      model.frontier_p80 = model.p80.horizonLength > maxP80;
      if (model.frontier_p80) maxP80 = model.p80.horizonLength;
    });

    // Update frontier status based on current probability
    setFrontierValues(currentProbability === 'p50' ? 50 : 80);

    // Reconfigure scale
    yScale = configureYScale(data, isLogScale, height);

    // Now update DOM elements with enter/update/exit pattern

    // Update error bars - use named transitions ('enter'/'exit') so they don't get
    // interrupted by updateChart's transitions
    const errorBarUpdate = g.selectAll('.error-bar').data(data, d => d.id);

    // Exit: mark as exiting, fade out and remove
    errorBarUpdate.exit()
      .classed('exiting', true)
      .transition('exit').duration(ANIMATION_DURATION)
      .style('opacity', 0)
      .remove();

    // Enter: create new error bars
    const errorBarEnter = errorBarUpdate.enter().append('line')
      .attr('class', d => `error-bar ${d.frontier ? 'frontier' : 'non-frontier'}`)
      .attr('x1', d => xScale(d.releaseDate))
      .attr('x2', d => xScale(d.releaseDate))
      .attr('y1', d => Math.min(yScale(d.ciLow), height))
      .attr('y2', d => yScale(d.ciHigh))
      .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR)
      .attr('stroke-width', 1)
      .attr('opacity', 0)
      .attr('data-model-name', d => d.name);

    errorBarEnter.transition('enter').duration(ANIMATION_DURATION)
      .attr('opacity', 0.2);

    // Update error bar caps (top)
    const capTopUpdate = g.selectAll('.error-bar-cap-top').data(data, d => d.id);
    capTopUpdate.exit().classed('exiting', true).transition('exit').duration(ANIMATION_DURATION).style('opacity', 0).remove();
    const capTopEnter = capTopUpdate.enter().append('line')
      .attr('class', 'error-bar-cap error-bar-cap-top')
      .attr('x1', d => xScale(d.releaseDate) - ERROR_BAR_CAP_WIDTH / 2)
      .attr('x2', d => xScale(d.releaseDate) + ERROR_BAR_CAP_WIDTH / 2)
      .attr('y1', d => yScale(d.ciHigh))
      .attr('y2', d => yScale(d.ciHigh))
      .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR)
      .attr('stroke-width', 1)
      .attr('opacity', 0);
    capTopEnter.transition('enter').duration(ANIMATION_DURATION).attr('opacity', 0.2);

    // Update error bar caps (bottom)
    const capBottomUpdate = g.selectAll('.error-bar-cap-bottom').data(data, d => d.id);
    capBottomUpdate.exit().classed('exiting', true).transition('exit').duration(ANIMATION_DURATION).style('opacity', 0).remove();
    const capBottomEnter = capBottomUpdate.enter().append('line')
      .attr('class', 'error-bar-cap error-bar-cap-bottom')
      .attr('x1', d => xScale(d.releaseDate) - ERROR_BAR_CAP_WIDTH / 2)
      .attr('x2', d => xScale(d.releaseDate) + ERROR_BAR_CAP_WIDTH / 2)
      .attr('y1', d => yScale(d.ciLow))
      .attr('y2', d => yScale(d.ciLow))
      .attr('stroke', d => d.frontier ? FRONTIER_COLOR : NON_FRONTIER_COLOR)
      .attr('stroke-width', 1)
      .attr('opacity', 0)
      .style('display', d => yScale(d.ciLow) >= height ? 'none' : 'block');
    capBottomEnter.transition('enter').duration(ANIMATION_DURATION).attr('opacity', 0.2);

    // Recalculate overlapping dots
    overlappingGroups = detectOverlappingDots(data, xScale, yScale);
    overlapInfo = new Map();
    overlappingGroups.forEach(group => {
      if (group.length > 1) {
        group.forEach((d, idx) => {
          overlapInfo.set(d.id, { group, index: idx, total: group.length });
        });
      }
    });

    // Get container for dots
    let dotsContainer = g.select('.dots-container');
    if (dotsContainer.empty()) {
      dotsContainer = g.append('g').attr('class', 'dots-container');
    }

    // Filter data to only non-overlapping points for regular dots
    const singleDotData = data.filter(d => !overlapInfo.has(d.id));

    // Update dots (only non-overlapping ones)
    const dotUpdate = dotsContainer.selectAll('.dot').data(singleDotData, d => d.id);

    dotUpdate.exit()
      .classed('exiting', true)
      .transition('exit').duration(ANIMATION_DURATION)
      .style('opacity', 0)
      .remove();

    const dotEnter = dotUpdate.enter().append('circle')
      .attr('class', d => `dot ${d.frontier ? 'frontier' : 'non-frontier'}`)
      .attr('r', LABEL_RADIUS)
      .attr('cx', d => xScale(d.releaseDate))
      .attr('cy', d => yScale(d.horizonLength))
      .attr('data-model-name', d => d.name)
      .style('opacity', 0);

    if (hasHover) {
      dotEnter.on('mouseover', showTooltip).on('mouseout', handleMouseOut);
    } else {
      dotEnter.on('click', function(event, d) {
        event.preventDefault();
        event.stopPropagation();
        showTooltip(event, d);
      });
    }

    dotEnter.transition('enter').duration(ANIMATION_DURATION).style('opacity', 1);

    // Rebuild split dots for overlapping pairs
    const splitDotGroupsData = overlappingGroups.filter(group => group.length === 2);
    splitDotGroupsData.forEach(group => {
      const sorted = [...group].sort((a, b) => a.releaseDate - b.releaseDate);
      const [leftModel, rightModel] = sorted;

      const cx = (xScale(leftModel.releaseDate) + xScale(rightModel.releaseDate)) / 2;
      const cy = (yScale(leftModel.horizonLength) + yScale(rightModel.horizonLength)) / 2;
      const r = LABEL_RADIUS;

      const splitGroup = dotsContainer.append('g')
        .attr('class', 'split-dot-group')
        .attr('transform', `translate(${cx}, ${cy})`)
        .style('opacity', 0);

      const leftHalf = splitGroup.append('path')
        .attr('class', `dot-half dot-half-left ${leftModel.frontier ? 'frontier' : 'non-frontier'}`)
        .attr('d', `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} L 0 0 Z`)
        .attr('data-model-name', leftModel.name)
        .datum(leftModel);

      const rightHalf = splitGroup.append('path')
        .attr('class', `dot-half dot-half-right ${rightModel.frontier ? 'frontier' : 'non-frontier'}`)
        .attr('d', `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} L 0 0 Z`)
        .attr('data-model-name', rightModel.name)
        .datum(rightModel);

      splitGroup.append('line')
        .attr('class', 'split-dot-divider')
        .attr('x1', 0)
        .attr('y1', -r)
        .attr('x2', 0)
        .attr('y2', r)
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5);

      if (hasHover) {
        leftHalf.on('mouseover', function(event) { showTooltip(event, leftModel); })
          .on('mouseout', function(event) { handleMouseOut(event, leftModel); });
        rightHalf.on('mouseover', function(event) { showTooltip(event, rightModel); })
          .on('mouseout', function(event) { handleMouseOut(event, rightModel); });
      } else {
        leftHalf.on('click', function(event) {
          event.preventDefault();
          event.stopPropagation();
          showTooltip(event, leftModel);
        });
        rightHalf.on('click', function(event) {
          event.preventDefault();
          event.stopPropagation();
          showTooltip(event, rightModel);
        });
      }

      splitGroup.transition('enter').duration(ANIMATION_DURATION).style('opacity', 1);
    });

    // Update label groups
    const labelGroupUpdate = g.selectAll('.model-label-group').data(data, d => d.id);

    // Exit: fade out old labels immediately as line starts moving
    labelGroupUpdate.exit()
      .classed('exiting', true)
      .transition('exit').duration(ANIMATION_DURATION / 2)
      .style('opacity', 0)
      .remove();

    // Enter: create new labels hidden via group opacity, overlap detection will
    // hide overlapping ones before the group is revealed
    const labelGroupEnter = labelGroupUpdate.enter().append('g')
      .attr('class', 'model-label-group entering')
      .style('opacity', 0); // Start hidden at group level

    labelGroupEnter.append('rect')
      .attr('class', 'model-label-bg');

    const newLabels = labelGroupEnter.append('text')
      .attr('class', 'model-label')
      .style('font-size', '12px')
      .style('fill', 'var(--color-secondary)')
      .style('font-weight', '500');

    if (hasHover) {
      newLabels.on('mouseover', showTooltip).on('mouseout', handleMouseOut);
    } else {
      newLabels.on('click', function(event, d) {
        event.preventDefault();
        event.stopPropagation();
        showTooltip(event, d);
      });
    }

    // Merge and update references for updateChart to use
    dots = dotsContainer.selectAll('.dot');
    errorBars = g.selectAll('.error-bar');
    errorBarCapsTop = g.selectAll('.error-bar-cap-top');
    errorBarCapsBottom = g.selectAll('.error-bar-cap-bottom');
    labels = g.selectAll('.model-label');
    labelBackgrounds = g.selectAll('.model-label-bg');

    // Now call updateChart to handle the transitions for existing elements
    updateChart();
  }

  // Expose setDataSource globally
  window.setDataSource = setDataSource;

  // Extends the y-axis line to reach the topmost tick, but not beyond the title middle
  function updateYAxisDomainLine(isTransition = false) {
    const tickValues = isLogScale ? generateLogScaleTicks(data) : generateLinearScaleTicks(data, currentProbability);
    const uncappedTopTickY = Math.min(0, ...tickValues.map(t => yScale(t)));

    // Calculate how far up (negative) the axis can go before hitting the title
    const titleBBox = chartTitle.node().getBBox();
    const chartTopInSvg = margin.top;
    const titleMiddleInSvg = titleBBox.y + titleBBox.height / 2;
    const minAllowedY = titleMiddleInSvg - chartTopInSvg;

    const topTickY = Math.max(minAllowedY, uncappedTopTickY);

    const domain = yAxisGroup.select('.domain');
    if (isTransition) {
      domain.transition().duration(ANIMATION_DURATION).attr('d', `M-6,${height}H0V${topTickY}`);
    } else {
      domain.attr('d', `M-6,${height}H0V${topTickY}`);
    }
  }

  function updateChart() {
    // Cancel any pending timeouts from previous transitions
    Object.keys(timeouts).forEach(key => {
      if (timeouts[key]) {
        clearTimeout(timeouts[key]);
      }
    });

    // Update y-axis with appropriate ticks for each scale
    const maxValue = d3.max(data, d => d.horizonLength);
    let tickValues = []; // Declare tickValues outside the if/else block

    let yAxis = configureYAxis(yScale, data, isLogScale, currentProbability);

    document.querySelectorAll('.current-probability').forEach(el => el.textContent = probabilityText(currentProbability));
    document.querySelectorAll('.a-current-probability').forEach(el => el.textContent = probabilityArticleText(currentProbability));

    yAxisGroup.transition().duration(ANIMATION_DURATION).call(yAxis);

    updateYAxisDomainLine(true);

    // Update grid with custom tick values
    const gridTickValues = generateGridTicks(isLogScale, yScale, tickValues, maxValue);

    g.select('.grid:nth-of-type(2)')
      .transition().duration(ANIMATION_DURATION)
      .call(d3.axisLeft(yScale)
        .tickValues(gridTickValues)
        .tickSize(-width)
        .tickFormat(''));

    // Recalculate overlapping groups with new scale
    const newOverlappingGroups = detectOverlappingDots(data, xScale, yScale);
    const newOverlapInfo = new Map();
    newOverlappingGroups.forEach(group => {
      if (group.length > 1) {
        group.forEach((d, idx) => {
          newOverlapInfo.set(d.id, { group, index: idx, total: group.length });
        });
      }
    });

    // Get dots container
    const dotsContainer = g.select('.dots-container');

    // Update remaining single dots (that stay single)
    // Exclude .exiting dots so the unnamed transition doesn't block D3's .remove()
    dotsContainer.selectAll('.dot:not(.exiting)').transition().duration(ANIMATION_DURATION)
      .attr('cy', d => yScale(d.horizonLength));

    // Update remaining split dot groups (that stay split)
    g.selectAll('.split-dot-group').each(function() {
      const splitGroup = d3.select(this);
      const leftHalf = splitGroup.select('.dot-half-left');
      const rightHalf = splitGroup.select('.dot-half-right');

      if (!leftHalf.empty() && !rightHalf.empty()) {
        const leftModel = leftHalf.datum();
        const rightModel = rightHalf.datum();

        const cx = (xScale(leftModel.releaseDate) + xScale(rightModel.releaseDate)) / 2;
        const cy = (yScale(leftModel.horizonLength) + yScale(rightModel.horizonLength)) / 2;

        // Interrupt any existing transition and ensure opacity is restored to 1
        splitGroup.interrupt();
        splitGroup.transition().duration(ANIMATION_DURATION)
          .attr('transform', `translate(${cx}, ${cy})`)
          .style('opacity', 1);
      }
    });

    // Update dots reference
    dots = dotsContainer.selectAll('.dot');

    // Update error bars (exclude exiting elements to not block D3's .remove())
    errorBars.filter(':not(.exiting)').transition().duration(ANIMATION_DURATION)
      .attr('y1', d => Math.min(yScale(d.ciLow), height)) // Clip at x-axis
      .attr('y2', d => Math.max(yScale(d.ciHigh), 0)); // Clip at top of chart

    errorBarCapsTop.filter(':not(.exiting)').transition().duration(ANIMATION_DURATION)
      .attr('y1', d => yScale(d.ciHigh))
      .attr('y2', d => yScale(d.ciHigh))
      .style('display', d => yScale(d.ciHigh) <= 0 ? 'none' : 'block'); // Hide if above chart

    errorBarCapsBottom.filter(':not(.exiting)').transition().duration(ANIMATION_DURATION)
      .attr('y1', d => yScale(d.ciLow))
      .attr('y2', d => yScale(d.ciLow))
      .style('display', d => yScale(d.ciLow) >= height ? 'none' : 'block'); // Hide if at or below x-axis

    // Update labels with smooth transition
    // First interrupt any existing transitions on labels and backgrounds
    labels.interrupt();
    labelBackgrounds.interrupt();

    const updateScreenSize = getScreenSize(containerRect.width);
    const updateLabelMargin = updateScreenSize.isNarrowMobile ? 6 : 8;
    const updateCharWidth = updateScreenSize.isNarrowMobile ? 5.5 : 7;
    const updateRightmostPoint = data.reduce((a, b) => {
      if (a.releaseDate.getTime() > b.releaseDate.getTime()) return a;
      if (a.releaseDate.getTime() === b.releaseDate.getTime() && a.horizonLength > b.horizonLength) return a;
      return b;
    });

    labels.each(function(d) {
      const { labelX, labelY: baseLabelY, anchor, isRightmost } = calculateSingleLabelPosition(d, xScale, yScale, height, {
        screenSize: updateScreenSize,
        rightmostPoint: updateRightmostPoint,
        labelMargin: updateLabelMargin,
        charWidth: updateCharWidth
      });
      let labelY = baseLabelY;

      // Handle multi-line labels
      const shouldSplit = isRightmost && d.name.length > 12;
      const label = d3.select(this);

      // Check if this is a new label that needs text content set
      const hasContent = label.text() || label.selectAll('tspan').size() > 0;

      if (shouldSplit) {
        const words = d.name.split(' ');
        if (words.length >= 2) {
          labelY = labelY - 6; // Adjust for two-line text

          // Find best split point
          let bestSplit = 1;
          let bestDiff = Math.abs(words[0].length - (d.name.length / 2));
          for (let i = 1; i < words.length - 1; i++) {
            const firstPart = words.slice(0, i + 1).join(' ');
            const diff = Math.abs(firstPart.length - (d.name.length / 2));
            if (diff < bestDiff) {
              bestDiff = diff;
              bestSplit = i + 1;
            }
          }
          const line1 = words.slice(0, bestSplit).join(' ');
          const line2 = words.slice(bestSplit).join(' ');

          // Calculate center position
          let centerX = labelX;
          if (anchor === 'start') {
            const maxLength = Math.max(line1.length, line2.length);
            centerX = labelX + (maxLength * 7) / 2;
          } else if (anchor === 'end') {
            const maxLength = Math.max(line1.length, line2.length);
            centerX = labelX - (maxLength * 7) / 2;
          }

          // If new label, set up the tspan structure and position immediately
          if (!hasContent) {
            label.selectAll('*').remove();
            label
              .attr('x', labelX)
              .attr('y', labelY)
              .attr('text-anchor', 'middle');
            label.append('tspan')
              .attr('x', centerX)
              .attr('dy', 0)
              .text(line1);
            label.append('tspan')
              .attr('x', centerX)
              .attr('dy', '1.2em')
              .text(line2);
          } else {
            // Existing label - transition to new position
            label.transition().duration(ANIMATION_DURATION)
              .attr('x', labelX)
              .attr('y', labelY)
              .attr('text-anchor', 'middle');

            // Update tspan positions
            label.selectAll('tspan')
              .transition().duration(ANIMATION_DURATION)
              .attr('x', centerX);
          }
        } else {
          // Single word, no split - set text and position
          if (!hasContent) {
            label.text(d.name)
              .attr('x', labelX)
              .attr('y', labelY)
              .attr('text-anchor', anchor);
          } else {
            label.transition().duration(ANIMATION_DURATION)
              .attr('x', labelX)
              .attr('y', labelY)
              .attr('text-anchor', anchor);
          }
        }
      } else {
        // Regular single-line labels - set text and position
        if (!hasContent) {
          label.text(d.name)
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('text-anchor', anchor);
        } else {
          label.transition().duration(ANIMATION_DURATION)
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('text-anchor', anchor);
        }
      }
    });

    // Hide label backgrounds during transition to avoid visual glitches
    labelBackgrounds.style('opacity', 0);

    // Update label backgrounds during transition
    labelBackgrounds.each(function(_, i) {
      const labelElement = labels.nodes()[i];
      if (labelElement && d3.select(labelElement).style('display') !== 'none') {
        // Get current position for smooth transition
        const label = d3.select(labelElement);
        const x = parseFloat(label.attr('x'));
        const y = parseFloat(label.attr('y'));
        const anchor = label.attr('text-anchor');

        // Skip if label position isn't set yet (new labels being created)
        if (isNaN(x) || isNaN(y)) return;

        const text = label.text() || label.selectAll('tspan').nodes().map(n => d3.select(n).text()).join(' ');
        const estimatedWidth = text.length * 7;

        let bgX, bgWidth;
        if (anchor === 'middle') {
          bgX = x - estimatedWidth / 2 - 3;
          bgWidth = estimatedWidth + 6;
        } else if (anchor === 'end') {
          bgX = x - estimatedWidth - 3;
          bgWidth = estimatedWidth + 6;
        } else {
          bgX = x - 3;
          bgWidth = estimatedWidth + 6;
        }

        d3.select(this).transition().duration(ANIMATION_DURATION)
          .attr('x', bgX)
          .attr('y', y - 10)
          .attr('width', bgWidth)
          .attr('height', 20);
      }
    });

    // After transition completes, run overlap detection and fade in/out labels
    timeouts['labelTransition'] = setTimeout(() => {
      // Store current visibility state
      const currentlyVisible = new Set();
      labels.each(function(d) {
        if (d3.select(this).style('display') !== 'none') {
          currentlyVisible.add(d.name);
        }
      });

      // Use the shared overlap detection logic
      const { visibleLabels } = detectVisibleLabels(data, xScale, yScale, height, { containerWidth: containerRect.width });

      // Fade in/out labels based on overlap detection
      labels.each(function(d, i) {
        const shouldBeVisible = visibleLabels.has(d.name);
        const wasVisible = currentlyVisible.has(d.name);

        if (shouldBeVisible && !wasVisible) {
          // Fade in
          d3.select(this)
            .style('display', 'block')
            .style('opacity', 0)
            .transition().duration(300)
            .style('opacity', 1);

          d3.select(labelBackgrounds.nodes()[i])
            .style('display', 'block')
            .style('opacity', 0)
            .transition().duration(300)
            .style('opacity', 0.75);
        } else if (!shouldBeVisible && wasVisible) {
          // Fade out
          d3.select(this)
            .transition().duration(300)
            .style('opacity', 0)
            .on('end', function() {
              d3.select(this).style('display', 'none');
            });

          d3.select(labelBackgrounds.nodes()[i])
            .transition().duration(300)
            .style('opacity', 0)
            .on('end', function() {
              d3.select(this).style('display', 'none');
            });
        }
        // Labels that remain visible don't need any change
      });

      // For entering label groups: hide overlapping labels immediately, then
      // reveal the group. This prevents the flicker where all labels briefly
      // appear before overlap detection hides them.
      const enteringGroups = g.selectAll('.model-label-group.entering');
      if (!enteringGroups.empty()) {
        enteringGroups.each(function() {
          const group = d3.select(this);
          // Immediately hide labels that should not be visible
          group.selectAll('.model-label').each(function(d) {
            if (!visibleLabels.has(d.name)) {
              d3.select(this).style('display', 'none').interrupt();
            }
          });
          group.selectAll('.model-label-bg').each(function(d) {
            if (!visibleLabels.has(d.name)) {
              d3.select(this).style('display', 'none').interrupt();
            }
          });
        });
        // Now reveal entering groups (overlapping labels already hidden)
        enteringGroups
          .classed('entering', false)
          .transition('enter')
          .duration(ANIMATION_DURATION / 2)
          .style('opacity', 1);
      }

      // Update background positions for visible labels
      timeouts['backgroundUpdate'] = setTimeout(() => {
        labelBackgrounds.each(function(_, i) {
          const labelElement = labels.nodes()[i];
          if (labelElement && d3.select(labelElement).style('display') !== 'none') {
            const bbox = labelElement.getBBox();
            d3.select(this)
              .attr('x', bbox.x - 3)
              .attr('y', bbox.y + 0.75)
              .attr('width', bbox.width + 6)
              .attr('height', bbox.height + 1.5)
              .style('opacity', 0.75);
          }
        });
      }, 350);
    }, ANIMATION_DURATION);

    // Update task descriptions (skip on narrow containers)
    const currentScreenSize = getScreenSize(containerRect.width);
    if (!currentScreenSize.isNarrowMobile) {
      // Fade out existing descriptions and connectors
      g.selectAll('.task-description, .task-connector')
        .transition()
        .duration(300)
        .style('opacity', 0)
        .remove();

      // After delay, add new descriptions based on scale
      timeouts['taskDescription'] = setTimeout(() => {
        const taskDescriptions = getTaskDescriptions(isLogScale, currentProbability);

        renderTaskDescriptions(g, taskDescriptions, yScale, height, {
          animate: true,
          animationDuration: ANIMATION_DURATION,
        });
      }, 500);
    }

    // Update trend line and confidence area
    // Recalculate frontier data based on current values
    const frontierData = data.filter(d => d.frontier);

    // Select the trend line group and path from the DOM
    const trendlineGroup = g.select('.trendline-group');
    const trendPath = trendlineGroup.select('path:not(.confidence-area)');

    const trendLineData = calculateTrendLine(frontierData);

    if (!trendPath.empty() && trendLineData) {
      const { curvePoints, solidPoints, dashedBeforePoints, dashedAfterPoints } = trendLineData;

      const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

      // Create area generator for confidence interval
      const area = d3.area()
        .x(d => xScale(d.date))
        .y0(d => yScale(Math.min(d.upper, 1000)))
        .y1(d => yScale(Math.max(d.lower, 0.0001)))
        .curve(d3.curveMonotoneX);

      // Update shaded area
      if (SHOW_CONFIDENCE_AREA) {
        let shadedArea = g.select('.confidence-area');
        if (shadedArea.empty() && curvePoints.length > 0) {
          // Create if doesn't exist
          shadedArea = g.append('path')
            .attr('class', 'confidence-area')
            .attr('fill', '#2e7d32')
            .attr('opacity', 0.1)
            .style('pointer-events', 'none');
        }
        if (!shadedArea.empty()) {
          shadedArea.transition().duration(ANIMATION_DURATION).attr('d', area(curvePoints));
        }
      }

      // Update paths
      if (SHOW_CONFIDENCE_AREA) {
        if (dashedPathBefore) {
          dashedPathBefore.transition().duration(ANIMATION_DURATION).attr('d', line(dashedBeforePoints));
        }
        if (trendPath) {
          trendPath.transition().duration(ANIMATION_DURATION).attr('d', line(solidPoints));
        }
        if (dashedPathAfter) {
          dashedPathAfter.transition().duration(ANIMATION_DURATION).attr('d', line(dashedAfterPoints));
        }
      } else {
        // When confidence area is disabled, animate by interpolating screen coordinates
        // This avoids issues with simultaneous y-scale and data changes.
        // We store raw (unclipped) screen points as the datum so old/new always share
        // the same date grid; clipping is applied per-frame during animation.
        if (!trendPath.empty()) {
          trendPath.interrupt(); // Cancel any in-progress transition

          // Get the old raw screen coordinates from stored data
          const oldRawScreenPoints = trendPath.datum();

          // Calculate new raw screen coordinates with the NEW yScale (unclipped)
          const newRawScreenPoints = curvePoints.map(p => ({
            ...p,
            screenY: yScale(p.value)
          }));

          // Check if old data has valid screenY values
          const hasValidOldScreenY = oldRawScreenPoints &&
            oldRawScreenPoints.length > 0 &&
            oldRawScreenPoints[0] &&
            typeof oldRawScreenPoints[0].screenY === 'number';

          // Store new raw screen coordinates for future transitions
          trendPath.datum(newRawScreenPoints);

          const screenLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => d.screenY)
            .curve(d3.curveMonotoneX);

          if (hasValidOldScreenY) {
            // Build a map of old screen Y values by date timestamp for fast lookup
            const oldScreenYByDate = new Map();
            oldRawScreenPoints.forEach(p => {
              oldScreenYByDate.set(p.date.getTime(), p.screenY);
            });

            trendPath
              .transition()
              .duration(ANIMATION_DURATION)
              .attrTween('d', function() {
                return function(t) {
                  const interpolatedPoints = newRawScreenPoints.map(point => {
                    const dateTime = point.date.getTime();
                    const startY = oldScreenYByDate.get(dateTime) ?? point.screenY;
                    return {
                      date: point.date,
                      screenY: startY + (point.screenY - startY) * t
                    };
                  });
                  return screenLine(clipScreenPointsAtBottom(interpolatedPoints, height));
                };
              });
          } else {
            // No valid old screen coordinates - just set directly
            const clippedScreenPoints = clipScreenPointsAtBottom(newRawScreenPoints, height);
            trendPath.attr('d', screenLine(clippedScreenPoints));
          }
        }
      }
    }
  }
}

function formatDuration(hours) {
  if (hours < 0.016) return `${Math.round(hours * 3600)} seconds`;
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);

    if (remainingHours === 0) {
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    }

    return `${days} ${days === 1 ? 'day' : 'days'} ${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}`;
  }

  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);

  if (minutes === 0) {
    return `${wholeHours} ${wholeHours === 1 ? 'hour' : 'hours'}`;
  }

  return `${wholeHours} ${wholeHours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

document.addEventListener('DOMContentLoaded', function() {
  initChart();

  // Add resize event listener with debouncing
  let resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      d3.select('#time-horizon-chart').selectAll('*').remove();
      d3.selectAll('.tooltip').remove();
      initChart();
    }, RESIZE_DEBOUNCE_DELAY);
  });
});
