package com.oxygenxml.examples.perforce;

import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Optional;

import com.perforce.p4java.core.file.FileSpecBuilder;
import com.perforce.p4java.core.file.FileSpecOpStatus;
import com.perforce.p4java.core.file.IFileSpec;
import com.perforce.p4java.exception.P4JavaException;
import com.perforce.p4java.exception.RequestException;
import com.perforce.p4java.option.server.GetDepotFilesOptions;
import com.perforce.p4java.server.IOptionsServer;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class P4ReadOperation extends P4Operation {

	private IOptionsServer server;
	private String depotPath;

	public P4ReadOperation(String uriString) {
		try {
			URI uri = new URI(uriString);
			serverUri = "p4javassl://" + uri.getHost() + ":" + uri.getPort();
			depotPath = uri.getPath();

			server = getOptionsServer(null, null);
			server.registerProgressCallback(new P4ProgressCallback());
		} catch (P4JavaException | URISyntaxException e) {
			log.error("Could not create read operation", e);
		}
	}

	public Optional<InputStream> read() {
		log.info("Working with server URI {}", serverUri);

		try {
			server.setUserName(userName);
			// must be connected to server in order to login
			server.connect();
			server.login(password);

			List<IFileSpec> fileList = server.getDepotFiles(FileSpecBuilder.makeFileSpecList(depotPath),
					new GetDepotFilesOptions());

			InputStream is = null;
			if (fileList != null) {
				for (IFileSpec fileSpec : fileList) {
					if (fileSpec != null) {
						if (fileSpec.getOpStatus() == FileSpecOpStatus.VALID) {
							is = fileSpec.getContents(true);
							log.debug(formatFileSpec(fileSpec));
						} else {
							log.error(fileSpec.getStatusMessage());
						}
					}
				}
			}

			return Optional.of(is);

		} catch (RequestException rexc) {
			log.error(rexc.getDisplayString(), rexc);
		} catch (Exception e) {
			log.error(e.getLocalizedMessage(), e);
		}

		return Optional.empty();
	}

	protected static String formatFileSpec(IFileSpec fileSpec) {
		return fileSpec.getDepotPathString();
	}

}
