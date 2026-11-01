FROM alpine:3.20

ARG PB_VERSION=0.40.6
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && unzip -q /tmp/pb.zip pocketbase -d /usr/local/bin \
 && rm /tmp/pb.zip

WORKDIR /pb
COPY pb_migrations ./pb_migrations

VOLUME ["/pb/pb_data"]
EXPOSE 8090

CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations"]
