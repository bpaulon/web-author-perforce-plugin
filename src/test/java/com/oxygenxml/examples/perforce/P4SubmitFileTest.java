package com.oxygenxml.examples.perforce;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.Charset;
import java.time.LocalDateTime;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class P4SubmitFileTest {

	@Rule
	public TemporaryFolder folder = new TemporaryFolder();

	// folder must exist
	String depotPath = "//depot/level1/";
	String filename = "test3.txt";

	@Test
	public void testPutFile() throws IOException {
		final File file = folder.newFile(filename);
		System.out.println(file.getAbsolutePath());

		writeContent(file);

		P4SubmitFile pd = new P4SubmitFile();
		pd.put(file, depotPath + filename, true);
	}

	@Test
	public void testWriteContent() throws IOException {
		String content = LocalDateTime.now().toString();
		byte[] contentBytes = content.getBytes(Charset.forName("UTF-8"));
		
		P4SubmitFile pd = new P4SubmitFile();
		pd.write(contentBytes, depotPath + filename);
	}

	private void writeContent(File file) throws IOException {
		String content = LocalDateTime.now().toString();
		try (PrintWriter writer = new PrintWriter(file)) {
			writer.write(content);
			writer.flush();
		}

	}
}
