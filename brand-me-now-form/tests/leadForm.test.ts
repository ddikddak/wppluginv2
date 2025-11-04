import { describe, it, expect } from 'vitest';
import { validateLead } from '../src/BrandMeNowWizard';

describe('validateLead', () => {
  it('flags missing required fields', () => {
    const errors = validateLead({ name: '', email: '', idea: '' });
    expect(errors).toEqual({
      name: 'This field is required.',
      email: 'This field is required.',
    });
  });

  it('requires a well-formed email', () => {
    const errors = validateLead({ name: 'Avery', email: 'bad-email', idea: 'Energy drink' });
    expect(errors.email).toBe('Enter a valid email address.');
  });

  it('accepts a complete lead payload', () => {
    const errors = validateLead({ name: 'Avery', email: 'avery@example.com', idea: 'Energy drink' });
    expect(errors).toEqual({});
  });
});

