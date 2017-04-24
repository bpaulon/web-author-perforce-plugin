package com.oxygenxml.examples.perforce;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.util.Optional;

import org.apache.commons.io.IOUtils;
import org.junit.Test;

import static org.junit.Assert.*;

public class P4GetFileTest {

	@Test
	public void getFileTest() {

		P4GetFile pg = new P4GetFile();
		Optional<InputStream> ois = pg.getFileAsStream("//StreamsDepot/mainSampleData/folderDiff/test9.txt");
		
		ois.ifPresent(is -> {
			StringWriter writer = new StringWriter();
			try {
				IOUtils.copy(is, writer,"UTF-8");
			} catch (IOException e) {
				e.printStackTrace();
			}
			String res = writer.toString();
			
			System.out.println("File contents:" + res);
			assertTrue("", res.contains("Sample Developer"));
			
		});
		
	}
}
