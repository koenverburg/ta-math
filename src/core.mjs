export function mean(array) {
  let sum = 0;
  for (let i = 0; i < array.length; i++) { sum += array[i]; }
  return sum / array.length;
}

export function sd(array) {
  let correction = (array.length > 1) ? math.sqrt(array.length / (array.length - 1)) : 1;
  return correction * rmsd(array, fillarray(array.length, mean(array)));
}

export function rmsd(f, g) {
  let sqrDiff = pointwise(f, g, (a, b) => (a - b) * (a - b));
  return Math.sqrt(mean(sqrDiff));
}

export function fillarray(length, value) {
  let result = []
  for (let i = 0; i < length; i++) {
    result.push(value);
  }
  return result;
}

export function pointwise(f, g, operation) {
  let result = [];
  for (let i = 0; i < f.length; i++) {
    result.push(operation(f[i], g[i]));
  }
  return result;
}

export function rolling(array, window, operation) {
  let result = [];
  for (let i = 0; i < array.length; i++) {
    let j = i + 1 - window;
    result.push(operation(array.slice((j > 0) ? j : 0, i + 1)));
  }
  return result;
}