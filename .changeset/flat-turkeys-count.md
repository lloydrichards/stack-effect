---
"stack-effect": minor
---

Persistent Todo applications can now be scaffolded with typed HTTP and RPC CRUD APIs, a React client, and either SQLite or PostgreSQL storage.

For example, create a full-stack SQLite Todo application with:

```bash
bunx stack-effect@latest create todo-app --yes \
  --target package/db:package-db-sqlite,package-db-todo-repository \
  --target server/api:server-http-api-todos,server-http-rpc-todos \
  --target client-react/web:client-react-http-api-todos
```
