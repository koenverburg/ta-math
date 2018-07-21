'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var tape = _interopDefault(require('tape'));
var tapSpec = _interopDefault(require('tap-spec'));
require('path');

function mean(array) {
  let sum = 0;
  for (let i = 0; i < array.length; i++) {
    sum += array[i];
  }
  return sum / array.length;
}

function sd(array) {
  //const correction = (array.length > 1) ? Math.sqrt(array.length / (array.length - 1)) : 1;
  return rmsd(array, fillarray(array.length, mean(array)));
}

function fillarray(length, value) {
  let result = [];
  for (let i = 0; i < length; i++) {
    result.push(value);
  }
  return result;
}

function rmsd(f, g) {
  const sqrDiff = pointwise(f, g, (a, b) => (a - b) * (a - b));
  return (f.length != g.length) ? Infinity : Math.sqrt(mean(sqrDiff));
}

function nrmsd(f, g) {
  return rmsd(f, g) / (Math.max(...f) - Math.min(...f));
}

function pointwise(f, g, operation) {
  let result = [];
  for (let i = 0; i < f.length; i++) {
    result.push(operation(f[i], g[i]));
  }
  return result;
}

function rolling(array, window, operation) {
  let result = [];
  for (let i = 0; i < array.length; i++) {
    let j = i + 1 - window;
    result.push(operation(array.slice((j > 0) ? j : 0, i + 1)));
  }
  return result;
}

let exchangeFormat = (x) => {
  return {
    length: x.length,
    time: (i) => x[i][0],
    open: (i) => x[i][1],
    high: (i) => x[i][2],
    low: (i) => x[i][3],
    close: (i) => x[i][4],
    volume: (i) => x[i][5]
  }
};

let simpleFormat = (x) => {
  return {
    length: x[0].length,
    time: (i) => x[0][i],
    open: (i) => x[1][i],
    high: (i) => x[2][i],
    low: (i) => x[3][i],
    close: (i) => x[4][i],
    volume: (i) => x[5][i]
  }
};

function sma($close, window) {
  return rolling($close, window, x => mean(x));
}

function std($close, window) {
  return rolling($close, window, x => sd(x));
}

function ema($close, window, weight = null) {
  let ema = [$close[0]];
  weight = weight ? weight : 2 / (window + 1);
  for (let i = 1; i < $close.length; i++) {
    ema.push(($close[i] - ema[i - 1]) * weight + ema[i - 1]);
  }  return ema;
}

function bband($close, window, mult) {
  const middle = sma($close, window);
  const upper = pointwise(middle, std($close, window), (a, b) => a + b * mult);
  const lower = pointwise(middle, std($close, window), (a, b) => a - b * mult);
  return { lower : lower, middle : middle, upper : upper};
}

function psar($high, $low, stepfactor, maxfactor) {
  let extreme = $low[0],  factor = 0;
  let isUp = true,   psar = [extreme];
  for (let i = 1; i < $high.length; i++) {
    let newsar = psar[i - 1] + factor * (extreme - psar[i - 1]);
    if ((isUp && newsar < $low[i]) || (!isUp && newsar > $high[i])) {
      if ((isUp && $high[i] > extreme) || (!isUp && $low[i] < extreme)) {
        extreme = (isUp) ? $high[i] : $low[i];
        factor = (factor <= maxfactor) ? factor + stepfactor : maxfactor;
      }    } else {
      isUp = !isUp;   factor = stepfactor;
      newsar = (isUp) ? Math.min($low.slice(-3)) : Math.max($high.slice(-3));
      extreme = (isUp) ? $high[i] : $low[i];
    }
    psar.push(newsar);
  }
  return psar;
}

function vbp($close, $volume, zones, left, right) {
  let vbp = fillarray(zones, 0);
  let bottom = Infinity, top = -Infinity, total = 0;
  for (let i = left; i < (right ? right : $close.length); i++) {
    total += $volume[i];
    top = (top < $close[i]) ? $close[i] : top;
    bottom = (bottom > $close[i]) ? $close[i] : bottom;
  }
  for (let i = left; i < (right ? right : $close.length); i++) {
    vbp[Math.floor(($close[i] - bottom + 1e-14) / (top - bottom + 1e-12) * (zones - 1))] += $volume[i];
  }
  return { bottom: bottom, top: top, volume: vbp.map((x) => { return x / total })};
}

function zigzag($time, $high, $low, percent) {
  let lowest = $low[0],         thattime = $time[0],     highest = $high[0];  
  let isUp = true,              time = [],              zigzag = [];
  for (let i = 1; i < $time.length; i++) {
    if (isUp) {
      if ($high[i] > highest) { thattime = $time[i];    highest = $high[i]; }      if ($low[i] < lowest + (highest - lowest) * (100 - percent) / 100) {
        isUp = false;           time.push(thattime);    zigzag.push(highest);
      }
    } else {
      if ($low[i] < lowest) {   thattime = $time[i];    lowest = $low[i]; }      if ($high[i] > lowest + (highest - lowest) * percent / 100) {
        isUp = true;            time.push(thattime);    zigzag.push(lowest);
      }
    }
  }  return { time : time, price : zigzag};
}

function macd($close, wshort, wlong, wsig) {
  const line = pointwise(ema($close, wshort), ema($close, wlong), (a, b) => a - b);
  const signal = ema(line, wsig);
  const hist = pointwise(line, signal, (a, b) => a - b);
  return { line : line, signal : signal, hist : hist };
}

function rsi($close, window) {
  let gains = [1e-14], loss = [0];
  for (let i = 1; i < $close.length; i++) {
    let diff = $close[i] - $close[i - 1];
    gains.push(diff >= 0 ? diff : 0);
    loss.push(diff < 0 ? -diff : 0);
  }
  let avgain = sma(gains, window);
  let avloss = sma(loss, window);
  return pointwise(avgain, avloss, (a, b) => 100 - 100 / (1 + a / b));
}

function obv($close, $volume) {
  let obv = [0];
  for (let i = 1; i < $close.length; i++) {
    obv.push(obv[i - 1] + Math.sign($close[i] - $close[i - 1]) * $volume[i]);
  }
  return obv;
}

function adl($high, $low, $close, $volume) {
  let adl = [$volume[0] * (2*$close[0] - $low[0] - $high[0]) / ($high[0] - $low[0])];
  for (let i = 1; i < $high.length; i++) {
    adl[i] = adl[i - 1] + $volume[i] * (2*$close[i] - $low[i] - $high[i]) / ($high[i] - $low[i]);
  }
  return adl;
}

/**
 * Class for calculating technical analysis indicators and overlays
 */
class TA {
  constructor(ohlcv, format = null) {
    this.format = (format == null) ? exchangeFormat : format;

    let proxy = (prop) => new Proxy(this.format(ohlcv)[prop], {
      get: (obj, key) => {
        if (key == 'length') {                 //length
          return this.format(ohlcv).length;
        } else if (key == 'slice') {          //slice
          return (start, end) => {
            var result = [];
            for (var i = start; i < end; i++) { result.push(obj(i)); }
            return result;
          }
        } else {
          try {
            if (key === parseInt(key).toString()) {   //operator[]
              return obj(key);
            }
          } catch(er) {}
        }
      }
    });

    this.$ = ['time', 'open', 'high', 'low', 'close', 'volume'];
    this.$.forEach(prop => this.$[prop] = proxy(prop));


    /* TECHNICAL ANALYSYS METHOD DEFENITION */

    return {
      sma:    (window = 15)                           =>    sma(this.$.close, window),
      ema:    (window = 10)                           =>    ema(this.$.close, window),
      std:    (window = 15)                           =>    std(this.$.close, window),
      bband:  (window = 15, mult = 2)                 =>    bband(this.$.close, window, mult),
      macd:   (wshort = 12, wlong = 26, wsig = 9)     =>    macd(this.$.close, wshort, wlong, wsig),
      rsi:    (window = 14)                           =>    rsi(this.$.close, window),
      psar:   (factor = 0.02, maxfactor = 0.2)        =>    psar(this.$.high, this.$.low, factor, maxfactor),
      obv:    ()                                      =>    obv(this.$.close, this.$.volume),
      adl:    ()                                      =>    adl(this.$.high, this.$.low, this.$.close, this.$.volume),
      vbp:    (zones = 12, left = 0, right = null)    =>    vbp(this.$.close, this.$.volume, zones, left, right),
      zigzag: (percent = 15)                          =>    zigzag(this.$.time, this.$.high, this.$.low, percent),
    }
  }
}

let randomize = (left, right) => {
  return (right - left) * Math.random() + left;
};

// random ohlcv
let random = fillarray(50).map(x => x = fillarray(6, 0));
random.map((tick, i) => {
  tick[0] = new Date('2018-01-01').getTime() + i * 60000;
  let lcoh = [randomize(5000, 20000),randomize(5000, 20000),randomize(5000, 20000),randomize(5000, 20000)].sort();
  if(randomize(0,1)) { let temp = lcoh[1]; lcoh[1] = lcoh[2]; lcoh[2] = temp; }  tick[1] = lcoh[1];  //o
  tick[2] = lcoh[0];  //h
  tick[3] = lcoh[3];  //l
  tick[4] = lcoh[2];  //c
  tick[5] = randomize(5, 1000);
});
let noize = new TA(random);

//prittify tests
tape.createStream()
  .pipe(tapSpec())
  .pipe(process.stdout);

tape('Mean & SD', (t) => {
  let data = [53.73,53.87,53.85,53.88,54.08,54.14,54.50,54.30,54.40,54.16];
  let delta = Math.abs(mean(data) - 54.09);
  t.ok(delta < 1e-2, `Direct mean test (${delta.toFixed(5)})`);
  let delta2 = Math.abs(sd(data) - 0.24);
  t.ok(delta2 < 1e-2, `Direct sd test (${delta2.toFixed(5)})`);
  t.end();
});

tape('RMSD', (t) => {
  t.ok(isFinite(rmsd(random[0], random[1])), 'Finite test');
  t.ok(rmsd(random[0],random[0]) == 0, 'Simple test');
  let delta = Math.abs(rmsd([-2,5,-8,9,-4],[0,0,0,0,0]) - 6.16);
  t.ok(delta < 1e-2, `Direct test (${delta.toFixed(5)})`);
  t.end();
});

tape('SMA', (t) => {
  let c = [22.27,22.19,22.08,22.17,22.18,22.13,22.23,22.43,22.24,22.29,22.15,22.39,22.38,22.61,23.36,
    24.05,23.75,23.83,23.95,23.63,23.82,23.87,23.65,23.19,23.10,23.33,22.68,23.10,22.40,22.17];
  let expected = [NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,22.22,22.21,22.23,22.26,22.31,22.42,22.61,
          22.77,22.91,23.08,23.21,23.38,23.53,23.65,23.71,23.69,23.61,23.51,23.43,23.28,23.13];
  let actual = new TA([c,c,c,c,c,c], simpleFormat).sma(10);
  t.ok(actual.every(isFinite), 'Finite test');
  let delta = nrmsd(expected.splice(9), actual.splice(9));
  t.ok(delta < 1e-2, `NRMSD test (${delta.toFixed(5)})`);
  t.end();
});

tape('EMA', (t) => {
  let c = [22.27,22.19,22.08,22.17,22.18,22.13,22.23,22.43,22.24,22.29,22.15,22.39,22.38,22.61,23.36,
    24.05,23.75,23.83,23.95,23.63,23.82,23.87,23.65,23.19,23.10,23.33,22.68,23.10,22.40,22.17];
  let expected = [NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,22.22,22.21,22.24,22.27,22.33,22.52,22.80,
          22.97,23.13,23.28,23.34,23.43,23.51,23.54,23.47,23.40,23.39,23.26,23.23,23.08,22.92];
  let actual = new TA([c,c,c,c,c,c], simpleFormat).ema(10);
  t.ok(actual.every(isFinite), 'Finite test');
  let delta = nrmsd(expected.splice(9), actual.splice(9));
  t.ok(delta < 1e-2, `NRMSD test (${delta.toFixed(5)})`);
  t.end();
});

tape('STD', (t) => {
  let c = [52.22,52.78,53.02,53.67,53.67,53.74,53.45,53.72,53.39,52.51,52.32,51.45,51.60,52.43,52.47,
    52.91,52.07,53.12,52.77,52.73,52.09,53.19,53.73,53.87,53.85,53.88,54.08,54.14,54.50,54.30,54.40,54.16];
  let expected = [NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,0.51,0.73,0.86,0.83,0.79,0.72,0.68,
    0.58,0.51,0.52,0.53,0.48,0.49,0.58,0.62,0.67,0.62,0.66,0.69,0.65,0.36,0.24];
  let actual = new TA([c,c,c,c,c,c], simpleFormat).std(10);
  t.ok(actual.every(isFinite), 'Finite test');
  let delta = nrmsd(expected.splice(10), actual.splice(10));
  t.ok(delta < 1e-2, `NRMSD test (${delta.toFixed(5)})`);
  t.end();
});

tape('BBAND', (t) => {
  let c = [86.16,89.09,88.78,90.32,89.07,91.15,89.44,89.18,86.93,87.68,86.96,89.43,89.32,88.72,
    87.45,87.26,89.50,87.90,89.13,90.70,92.90,92.98,91.80,92.66,92.68,92.30,92.77,92.54,92.95,
    93.20,91.07,89.83,89.74,90.40,90.74,88.02,88.09,88.84,90.78,90.54,91.39,90.65];
  let expected = [NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,86.12,
    86.14,85.87,85.85,85.70,85.65,85.59,85.56,85.60,85.98,86.27,86.82,86.87,86.91,87.12,87.63,87.83,
    87.56,87.76,87.97,87.95,87.96,87.95];
  let bb = new TA([c,c,c,c,c,c], simpleFormat).bband(20,2);
  t.ok((bb.lower.every(isFinite) && bb.middle.every(isFinite) && bb.upper.every(isFinite)), 'Finite test');
  let delta = nrmsd(expected.splice(19), bb.lower.splice(19));
  t.ok(delta < 1e-2, `NRMSD test on lower (${delta.toFixed(5)})`);
  t.end();
});

tape('MACD', (t) => {
  let macd = noize.macd();
  t.ok(macd.line.every(isFinite) && macd.signal.every(isFinite) && macd.hist.every(isFinite), 'Finite test');
  t.end();
});

tape('RSI', (t) => {
  let c = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,
    46.03,46.41,46.22,45.64,46.21,46.25,45.71,46.45,45.78,45.35,44.03,44.18,44.22,44.57,43.42,42.66,43.13];
  let expected = [NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,70.53,66.32,66.55,69.41,
    66.36,57.97,62.93,63.26,56.06,62.38,54.71,50.42,39.99,41.46,41.87,45.46,37.30,33.08,37.77];
  let actual = new TA([c,c,c,c,c,c], simpleFormat).rsi(14);
  t.ok(actual.every(isFinite), 'Finite test');
  let delta = nrmsd(expected.splice(14), actual.splice(14));
  t.ok(delta < 1e-2, `NRMSD test (${delta.toFixed(5)})`);
  t.end();
});

tape('VBP', (t) => {
  let vbp = noize.vbp();
  let delta = sd(vbp.volume);
  t.ok([vbp.bottom, vbp.top].every(isFinite) && vbp.volume.every(isFinite), 'Finite test');
  t.ok(vbp.bottom < vbp.top, 'Bottom lower than top');
  t.ok(delta < 0.1, `SD of uniform distribution (${delta.toFixed(5)})`);
  t.end();
});

tape('ZigZag', (t) => {
  let zz = noize.zigzag();
  t.ok(zz.time.every(isFinite) && zz.price.every(isFinite), 'Finite test');
  let isUpDown = true;
  zz.price.forEach((x, i) => {
    if(i > 1 && Math.sign((zz.price[i - 2] - zz.price[i - 1]) * (zz.price[i - 1] - zz.price[i])) != -1) {
      isUpDown = false;
    }
  });
  t.ok(isUpDown, 'Up-down test');
  // for (let i = 0; i < zz.time.length - 1; i++) {
  //   console.log(noize.$.close[0]);
  // }
  t.end();
});

tape('OBV', (t) => {
  let c = [53.26,53.30,53.32,53.37,54.19,53.92,54.65,54.60];
  let v = [8000,8200,8100,8300,8900,9200,13300,10300];
  let expected = [0,8200,16300,24600,33500,24300,37600,27300];
  let actual = new TA([c,c,c,c,c,v], simpleFormat).obv();
  let delta = nrmsd(expected, actual);
  t.ok(actual.every(isFinite), 'Finite test');
  t.ok(delta < 1e-2, `NRMSD test (${delta.toFixed(5)})`);
  t.end();
});

tape('ADL', (t) => {
  let h = [62.34,62.05,62.27,60.79,59.93,61.75,60.00,59.00];
  let l = [61.37,60.69,60.10,58.61,58.71,59.86,57.97,58.02];
  let c = [62.15,60.81,60.45,59.18,59.24,60.20,58.48,58.24];
  let v = [7849,11692,10575,13059,20734,29630,17705,7259];
  let expected = [4774,-4855,-12019,-18249,-21006,-39976,-48785,-52785];
  let actual = new TA([c,c,h,l,c,v], simpleFormat).adl();
  let delta = nrmsd(expected, actual);
  t.ok(actual.every(isFinite), 'Finite test');
  t.ok(delta < 1e-2, `NRMSD test (${delta.toFixed(5)})`);
  t.end();
});

tape('ADL', (t) => {
  let h = [62.34,62.05,62.27,60.79,59.93,61.75,60.00,59.00];
  let l = [61.37,60.69,60.10,58.61,58.71,59.86,57.97,58.02];
  let c = [62.15,60.81,60.45,59.18,59.24,60.20,58.48,58.24];
  let v = [7849,11692,10575,13059,20734,29630,17705,7259];
  let expected = [4774,-4855,-12019,-18249,-21006,-39976,-48785,-52785];
  let actual = new TA([c,c,h,l,c,v], simpleFormat).adl();
  let delta = nrmsd(expected, actual);
  t.ok(actual.every(isFinite), 'Finite test');
  t.ok(delta < 1e-2, `NRMSD test (${delta.toFixed(5)})`);
  t.end();
});

tape('PSAR', (t) => {
  let h = [48.11,48.30,48.17,48.60,48.33,48.40,48.55,48.45,48.70,48.72,48.90,48.87,48.82,49.05,49.20,49.35];
  let l = [47.25,47.77,47.91,47.90,47.74,48.10,48.06,48.07,47.79,48.14,48.39,48.37,48.24,48.64,48.94,48.86];
  let expected = [47.25,47.25,47.25,47.27,47.32,47.38,47.42,47.47,47.52,47.59,47.68,47.80,47.91,48.01,48.13,48.28];
  let actual = new TA([h,h,h,l,l,l], simpleFormat).psar();
  t.ok(actual.every(isFinite), 'Finite test');
  let delta = rmsd(expected.splice(1), actual.splice(1));
  t.ok(delta < 2e-2, `NRMSD uptrend test (${delta.toFixed(5)})`);
  t.end();
});
