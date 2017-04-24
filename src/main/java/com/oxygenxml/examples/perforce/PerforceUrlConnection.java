package com.oxygenxml.examples.perforce;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLConnection;
import java.util.Optional;

import lombok.extern.slf4j.Slf4j;
import ro.sync.ecss.extensions.api.webapp.plugin.FilterURLConnection;

@Slf4j
public class PerforceUrlConnection extends FilterURLConnection {

	public PerforceUrlConnection(URLConnection delegateConnection) {
		super(delegateConnection);
	}

	@Override
	public InputStream getInputStream() throws IOException {
		log.info("input stream to {}", url);

		P4ReadOperation readOp = new P4ReadOperation(url.toString());
		Optional<InputStream> optionalIs = readOp.read();
		return optionalIs.get();
	}

	@Override
	public OutputStream getOutputStream() throws IOException {
		log.info("output stream from {}", url);
		
		return new ByteArrayOutputStream() {
			@Override
			public void close() throws IOException {
				byte[] fileContents = toByteArray();
				P4WriteOperation writeOp = new P4WriteOperation(url.toString());
				writeOp.write(fileContents);
			}
		};
	}

}
