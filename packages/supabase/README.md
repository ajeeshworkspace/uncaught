# @uncaughtdev/supabase

Supabase client wrapper for [Uncaught](https://github.com/AjeeshDevops/uncaught) error monitoring.

## Install

```bash
npm install @uncaughtdev/supabase
```

## Usage

```typescript
import { wrapSupabase } from '@uncaughtdev/supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = wrapSupabase(createClient(url, key));
```

## What's included

- Deep Proxy wrapper — intercepts all Supabase operations
- Query chain tracking (`.from().select().eq()` etc.)
- Error parsing (Postgrest, Auth, Functions, Storage)
- RLS violation explainer with human-readable messages

## License

MIT
