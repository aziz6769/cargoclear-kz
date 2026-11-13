import { z } from 'zod';

// Messages are i18n keys; the form translates them when rendering.
const email = z.string().trim().min(1, 'auth.v.email').email('auth.v.email').max(254, 'auth.v.email');
const password = z.string().min(8, 'auth.v.passwordMin').max(72, 'auth.v.passwordMax');

export const loginSchema = z.object({ email, password: z.string().min(1, 'auth.v.passwordReq') });

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'auth.v.name').max(120, 'auth.v.name'),
    company: z.string().trim().min(2, 'auth.v.company').max(160, 'auth.v.company'),
    email,
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'auth.v.mismatch' });

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'auth.v.mismatch' });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'auth.v.name').max(120, 'auth.v.name'),
  company: z.string().trim().min(2, 'auth.v.company').max(160, 'auth.v.company'),
  language: z.enum(['ru', 'kk', 'en']),
});
