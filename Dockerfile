FROM python:3.11-slim

WORKDIR /app

COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ ./server/

EXPOSE 8785

# Standard MCP stdio mode for introspection and tool execution
CMD ["python", "server/bridge_server.py", "--mcp"]
