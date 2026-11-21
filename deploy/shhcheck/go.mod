module github.com/skoow/shhdrop/deploy/shhcheck

// 1.25 : tls.ConnectionState.CurveID. Même chaîne d'outils que server/go.mod.
go 1.26.0

toolchain go1.27.4

require (
	github.com/pion/logging v0.2.4
	github.com/pion/stun/v3 v3.1.7
	github.com/pion/turn/v4 v4.1.4
)

require (
	github.com/pion/dtls/v3 v3.1.16 // indirect
	github.com/pion/randutil v0.1.0 // indirect
	github.com/pion/transport/v4 v4.1.0 // indirect
	github.com/pion/transport/v5 v5.0.0 // indirect
	github.com/wlynxg/anet v0.0.5 // indirect
	golang.org/x/crypto v0.59.0 // indirect
	golang.org/x/sys v0.50.0 // indirect
)
