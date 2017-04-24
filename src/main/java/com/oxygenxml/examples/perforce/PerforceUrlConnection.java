package com.oxygenxml.examples.perforce;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLConnection;
import java.util.Optional;

import lombok.extern.slf4j.Slf4j;
import ro.sync.ecss.extensions.api.webapp.plugin.FilterURLConnection;
import ro.sync.exml.plugin.urlstreamhandler.CacheableUrlConnection;

@Slf4j
public class PerforceUrlConnection extends FilterURLConnection implements CacheableUrlConnection {

	public PerforceUrlConnection(URLConnection delegateConnection) {
		super(delegateConnection);
	}

	String depotPath = "//depot/level1/sample.xml";

	@Override
	public InputStream getInputStream() throws IOException {
		log.debug("reading stream from {}", depotPath);

		P4GetFile pg = new P4GetFile();
		Optional<InputStream> ois = pg.getFileAsStream(depotPath);
		return ois.get();
	}

	@Override
	public OutputStream getOutputStream() throws IOException {
		log.debug("getOutputStream");
		
		return new ByteArrayOutputStream() {

			@Override
			public void close() throws IOException {
				byte[] fileContents = toByteArray();
				P4SubmitFile submitOp = new P4SubmitFile();
				submitOp.write(fileContents, depotPath);
			}
		};
	}

}
