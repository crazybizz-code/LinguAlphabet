// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { motivationStage, createMotivationStage, MOTIVATION_TAGS } from './motivation.js';

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  motivationStage.unmount();
});

function clickTag(value) {
  container.querySelector(`.ob2-chip[data-value="${value}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function typeFreeText(text) {
  const textarea = container.querySelector('.ob2-freetext-input');
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('motivationStage', () => {
  it('has the expected id', () => {
    expect(motivationStage.id).toBe('motivation');
  });

  it('renders every motivation tag and an empty free-text field', () => {
    motivationStage.mount({ container });
    expect(container.querySelectorAll('.ob2-chip')).toHaveLength(MOTIVATION_TAGS.length);
    expect(container.querySelector('.ob2-freetext-input').value).toBe('');
  });

  it('is invalid with nothing selected and no free text', () => {
    motivationStage.mount({ container });
    expect(motivationStage.validate()).toBe(false);
    expect(motivationStage.collect()).toEqual({ tags: [], freeText: '' });
  });

  it('is valid with at least one tag selected (product decision: tags supported)', () => {
    motivationStage.mount({ container });
    clickTag('Career');
    expect(motivationStage.validate()).toBe(true);
    expect(motivationStage.collect()).toEqual({ tags: ['Career'], freeText: '' });
  });

  it('is valid with only free text (product decision: free text supported)', () => {
    motivationStage.mount({ container });
    typeFreeText('I want a promotion at work');
    expect(motivationStage.validate()).toBe(true);
    expect(motivationStage.collect()).toEqual({ tags: [], freeText: 'I want a promotion at work' });
  });

  it('supports BOTH tags and free text at once (product decision)', () => {
    motivationStage.mount({ container });
    clickTag('Career');
    clickTag('Travel');
    typeFreeText('  I want to travel confidently  ');
    expect(motivationStage.validate()).toBe(true);
    expect(motivationStage.collect()).toEqual({
      tags: ['Career', 'Travel'],
      freeText: 'I want to travel confidently',
    });
  });

  it('is invalid when free text is only whitespace and no tag is selected', () => {
    motivationStage.mount({ container });
    typeFreeText('   ');
    expect(motivationStage.validate()).toBe(false);
  });

  it('resumes previously collected tags and free text from initialData', () => {
    motivationStage.mount({
      container,
      initialData: { tags: ['University'], freeText: 'because reasons' },
    });
    expect(container.querySelector('.ob2-freetext-input').value).toBe('because reasons');
    expect(motivationStage.collect()).toEqual({ tags: ['University'], freeText: 'because reasons' });
  });

  it('updates the character counter as the user types', () => {
    motivationStage.mount({ container });
    typeFreeText('hello');
    expect(container.querySelector('.ob2-freetext-count').textContent).toBe('5/280');
  });

  it('unmount removes the input listener and clears the container', () => {
    let changeCount = 0;
    motivationStage.mount({ container, onChange: () => { changeCount += 1; } });
    typeFreeText('hello');
    const countAfterMount = changeCount;
    motivationStage.unmount();

    // Re-dispatching on a detached node must not affect the (now torn down) stage.
    const orphanedTextarea = container.querySelector('.ob2-freetext-input');
    expect(orphanedTextarea).toBeNull();
    expect(container.innerHTML).toBe('');
    expect(changeCount).toBe(countAfterMount);
    expect(motivationStage.collect()).toEqual({ tags: [], freeText: '' });
  });
});

describe('createMotivationStage (factory)', () => {
  it('produces independent instances with isolated tag/free-text state', () => {
    const instanceA = createMotivationStage();
    const instanceB = createMotivationStage();
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');

    instanceA.mount({ container: containerA });
    instanceB.mount({ container: containerB });

    containerA.querySelector('.ob2-chip[data-value="Career"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const textareaA = containerA.querySelector('.ob2-freetext-input');
    textareaA.value = 'promotion';
    textareaA.dispatchEvent(new Event('input', { bubbles: true }));

    expect(instanceA.collect()).toEqual({ tags: ['Career'], freeText: 'promotion' });
    expect(instanceB.collect()).toEqual({ tags: [], freeText: '' });
    expect(instanceB.validate()).toBe(false);

    instanceA.unmount();
    instanceB.unmount();
  });
});
