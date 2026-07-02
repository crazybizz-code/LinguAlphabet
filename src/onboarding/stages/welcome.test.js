// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { welcomeStage, createWelcomeStage } from './welcome.js';

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  welcomeStage.unmount();
});

describe('welcomeStage', () => {
  it('has the expected id and satisfies the stage contract', () => {
    expect(welcomeStage.id).toBe('welcome');
  });

  it('renders a generic greeting with no initialData', () => {
    welcomeStage.mount({ container });
    expect(container.querySelector('.ob2-heading').textContent).toBe('Welcome!');
  });

  it('personalizes the greeting when a displayName is provided', () => {
    welcomeStage.mount({ container, initialData: { displayName: 'Yodgor' } });
    expect(container.querySelector('.ob2-heading').textContent).toBe('Welcome back, Yodgor!');
  });

  it('previews the four steps ahead', () => {
    welcomeStage.mount({ container });
    const steps = [...container.querySelectorAll('.ob2-welcome-steps li')].map(li => li.textContent);
    expect(steps).toEqual([
      'Pick your main learning goal',
      'Tell us your English level',
      'Choose your daily study time',
      'Share what motivates you',
    ]);
  });

  it('is always valid — nothing is required to proceed', () => {
    welcomeStage.mount({ container });
    expect(welcomeStage.validate()).toBe(true);
  });

  it('collects nothing', () => {
    welcomeStage.mount({ container });
    expect(welcomeStage.collect()).toEqual({});
  });

  it('unmount clears the container', () => {
    welcomeStage.mount({ container });
    welcomeStage.unmount();
    expect(container.innerHTML).toBe('');
  });
});

describe('createWelcomeStage (factory)', () => {
  it('produces independent instances that do not share mount state', () => {
    const instanceA = createWelcomeStage();
    const instanceB = createWelcomeStage();
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');

    instanceA.mount({ container: containerA, initialData: { displayName: 'Alice' } });
    instanceB.mount({ container: containerB, initialData: { displayName: 'Bob' } });

    expect(containerA.querySelector('.ob2-heading').textContent).toBe('Welcome back, Alice!');
    expect(containerB.querySelector('.ob2-heading').textContent).toBe('Welcome back, Bob!');

    instanceA.unmount();
    expect(containerA.innerHTML).toBe('');
    expect(containerB.innerHTML).not.toBe('');

    instanceB.unmount();
  });

  it('produces a stage satisfying the same contract as the singleton', () => {
    const instance = createWelcomeStage();
    expect(instance.id).toBe(welcomeStage.id);
    expect(instance).not.toBe(welcomeStage);
  });
});
