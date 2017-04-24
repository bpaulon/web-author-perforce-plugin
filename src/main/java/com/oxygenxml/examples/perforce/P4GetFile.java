package com.oxygenxml.examples.perforce;

import java.io.InputStream;
import java.util.List;
import java.util.Optional;

import com.perforce.p4java.core.file.FileSpecBuilder;
import com.perforce.p4java.core.file.FileSpecOpStatus;
import com.perforce.p4java.core.file.IFileSpec;
import com.perforce.p4java.exception.RequestException;
import com.perforce.p4java.option.server.GetDepotFilesOptions;
import com.perforce.p4java.server.IOptionsServer;

import lombok.extern.slf4j.Slf4j;


@Slf4j
public class P4GetFile extends P4ServerUtils {

	public Optional<InputStream> getFileAsStream(String depotPath) {
		try {
			IOptionsServer server = getOptionsServer(null, null);
			server.registerProgressCallback(new P4ProgressCallback());

			server.setUserName(userName);
			server.login(password);
			
			log.info("Working with server URI {}", serverUri);
			
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
