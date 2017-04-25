package com.oxygenxml.examples.perforce;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.PasswordAuthentication;
import java.net.URLConnection;

import lombok.extern.slf4j.Slf4j;
import ro.sync.ecss.extensions.api.webapp.plugin.FilterURLConnection;

@Slf4j
public class PerforceUrlConnection extends FilterURLConnection {

	private PasswordAuthentication credentials;

	public PerforceUrlConnection(URLConnection delegateConnection, PasswordAuthentication credentials) {
		super(delegateConnection);
		this.credentials = credentials;
	}

	@Override
	public InputStream getInputStream() throws IOException {
		log.debug("input stream to {}", url);

		InputStream is = null;
		try {
			log.debug("Reading url: {} user: {} - pass: {}", url, credentials.getUserName(), credentials.getPassword());

			P4ReadOperation readOp = new P4ReadOperation(url.toString(), credentials);
			is = readOp.read();
			return is;
		} catch (Exception e) {
			log.error("Exception reading file: ", e);
		}
		return is;
	}

	@Override
	public OutputStream getOutputStream() throws IOException {
		log.debug("output stream from {}", url);

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
