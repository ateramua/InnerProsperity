import { test } from '@playwright/test';

export function step(title, body) {
  try {
    test.info();
    return test.step(title, body);
  } catch {
    return body();
  }
}

export function given(title, body) {
  return step(`Given ${title}`, body);
}

export function when(title, body) {
  return step(`When ${title}`, body);
}

export function then(title, body) {
  return step(`Then ${title}`, body);
}

export function and(title, body) {
  return step(`And ${title}`, body);
}
