.PHONY: reverse-proxy db-tunnel

reverse-proxy:
	caddy reverse-proxy --from localhost:8080 --to :3000 -c

db-tunnel:
	ssh -L3306:localhost:3306 -N lobbywat@s034.cyon.net

